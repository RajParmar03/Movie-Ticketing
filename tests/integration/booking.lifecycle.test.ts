import {
  request,
  setupTestDb,
  cleanDb,
  createAdminAndGetToken,
  createCustomerAndGetToken,
  createScreen,
  createMovie,
  createShowtime,
  getSeatIds,
  disconnect,
} from '../helpers/testSetup';

let adminToken: string;
let customerToken: string;
let customerId: string;
let showtimeId: string;
let seatIds: string[];

beforeAll(async () => {
  await setupTestDb();
});

beforeEach(async () => {
  await cleanDb();
  adminToken = await createAdminAndGetToken();
  ({ token: customerToken, userId: customerId } = await createCustomerAndGetToken());
  const screen = await createScreen(adminToken);
  const movie = await createMovie(adminToken);
  const showtime = await createShowtime(adminToken, movie.id, screen.id);
  showtimeId = showtime.id;
  seatIds = await getSeatIds(showtimeId, adminToken, 2);
});

afterAll(async () => {
  await disconnect();
});

describe('Full booking lifecycle', () => {
  it('GET /showtimes/:id/seats — returns seat map with available status', async () => {
    const res = await request
      .get(`/api/showtimes/${showtimeId}/seats`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.seats).toBeInstanceOf(Array);
    expect(res.body.data.seats.every((s: { status: string }) => s.status === 'available')).toBe(true);
  });

  it('POST /bookings/reserve — holds selected seats and returns expiry', async () => {
    const res = await request
      .post('/api/bookings/reserve')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ showtimeId, seatIds });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data).toHaveProperty('bookingId');
    expect(res.body.data).toHaveProperty('expiresAt');
    expect(res.body.data.seats).toHaveLength(2);
  });

  it('GET /showtimes/:id/seats — shows held seats after reservation', async () => {
    await request
      .post('/api/bookings/reserve')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ showtimeId, seatIds });

    const res = await request
      .get(`/api/showtimes/${showtimeId}/seats`)
      .set('Authorization', `Bearer ${customerToken}`);
    const heldSeats = (res.body as { data: { seats: Array<{ status: string }> } }).data.seats.filter(
      (s) => s.status === 'held',
    );
    expect(heldSeats).toHaveLength(2);
  });

  it('POST /bookings/:id/confirm — confirms booking and creates payment', async () => {
    const reserveRes = await request
      .post('/api/bookings/reserve')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ showtimeId, seatIds });

    const { bookingId } = (reserveRes.body as { data: { bookingId: string } }).data;

    const confirmRes = await request
      .post(`/api/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ paymentMethod: 'card', cardLastFour: '4242' });

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.data.status).toBe('confirmed');
    expect(confirmRes.body.data).toHaveProperty('bookingReference');
    expect(confirmRes.body.data.bookingReference).toMatch(/^BK-/);
    expect(confirmRes.body.data.payment.status).toBe('completed');
  });

  it('DELETE /bookings/:id — cancels a pending booking and releases seats', async () => {
    const reserveRes = await request
      .post('/api/bookings/reserve')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ showtimeId, seatIds });
    const { bookingId } = (reserveRes.body as { data: { bookingId: string } }).data;

    const cancelRes = await request
      .delete(`/api/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(cancelRes.status).toBe(200);

    // Verify seats are available again
    const seatsRes = await request
      .get(`/api/showtimes/${showtimeId}/seats`)
      .set('Authorization', `Bearer ${customerToken}`);
    const available = (
      seatsRes.body as { data: { seats: Array<{ status: string }> } }
    ).data.seats.filter((s) => s.status === 'available');
    expect(available.length).toBeGreaterThanOrEqual(2);
  });

  it('DELETE /bookings/:id (confirmed) — cancels confirmed booking and marks payment refunded', async () => {
    const reserveRes = await request
      .post('/api/bookings/reserve')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ showtimeId, seatIds });
    const { bookingId } = (reserveRes.body as { data: { bookingId: string } }).data;

    await request
      .post(`/api/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ paymentMethod: 'card', cardLastFour: '4242' });

    const cancelRes = await request
      .delete(`/api/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(cancelRes.status).toBe(200);

    const detailRes = await request
      .get(`/api/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect((detailRes.body as { data: { status: string } }).data.status).toBe('cancelled');
    expect((detailRes.body as { data: { payment: { status: string } } }).data.payment?.status).toBe('refunded');
  });

  it('GET /bookings/my — returns only the current user bookings', async () => {
    await request
      .post('/api/bookings/reserve')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ showtimeId, seatIds });

    const res = await request
      .get('/api/bookings/my')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.bookings).toHaveLength(1);
  });

  it('GET /bookings — admin can list all bookings', async () => {
    await request
      .post('/api/bookings/reserve')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ showtimeId, seatIds });

    const res = await request
      .get('/api/bookings')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.bookings.length).toBeGreaterThanOrEqual(1);
  });

  it('returns 403 when customer tries to access /bookings admin endpoint', async () => {
    const res = await request
      .get('/api/bookings')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 409 when confirming an already-confirmed booking', async () => {
    const reserveRes = await request
      .post('/api/bookings/reserve')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ showtimeId, seatIds });
    const { bookingId } = (reserveRes.body as { data: { bookingId: string } }).data;

    await request
      .post(`/api/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ paymentMethod: 'card', cardLastFour: '4242' });

    const res = await request
      .post(`/api/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ paymentMethod: 'card', cardLastFour: '4242' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BOOKING_ALREADY_CONFIRMED');
  });

  it('returns 409 when reserving an already-held seat', async () => {
    // First user holds the seat
    await request
      .post('/api/bookings/reserve')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ showtimeId, seatIds });

    // Second attempt for the same seat
    const { token: token2 } = await createCustomerAndGetToken('customer2@test.com');
    const res = await request
      .post('/api/bookings/reserve')
      .set('Authorization', `Bearer ${token2}`)
      .send({ showtimeId, seatIds });
    expect(res.status).toBe(409);
  });
});
