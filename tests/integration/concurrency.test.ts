/**
 * Concurrency Test — The Mandatory Test
 *
 * Proves that SELECT ... FOR UPDATE SKIP LOCKED prevents double-booking.
 *
 * Scenario:
 *   - 1 showtime with 3 seats total
 *   - 10 users simultaneously attempt to book the SAME single seat
 *   - Expected: exactly 1 succeeds (201), exactly 9 fail (409)
 *   - Post-condition: the seat has exactly 1 held row in seat_inventory
 */

import {
  request,
  prisma,
  setupTestDb,
  cleanDb,
  createAdminAndGetToken,
  createScreen,
  createMovie,
  createShowtime,
  getSeatIds,
  disconnect,
} from '../helpers/testSetup';
import bcrypt from 'bcrypt';

const CONCURRENT_USERS = 10;

beforeAll(async () => {
  await setupTestDb();
});

afterEach(async () => {
  await cleanDb();
});

afterAll(async () => {
  await disconnect();
});

describe('Concurrency — SELECT FOR UPDATE SKIP LOCKED', () => {
  it('allows exactly 1 of 10 simultaneous reserve requests for the same seat to succeed', async () => {
    // ── Setup ─────────────────────────────────────────────────────────────────
    const adminToken = await createAdminAndGetToken();

    // Screen with exactly 3 seats (3 rows × 1 seat)
    const screen = await createScreen(adminToken, 'ConcurrencyScreen', 3, 1);
    const movie = await createMovie(adminToken, 'Race Condition Movie');
    const showtime = await createShowtime(adminToken, movie.id, screen.id);

    // Get all available seat IDs
    const [targetSeatId] = await getSeatIds(showtime.id, adminToken, 1);
    expect(targetSeatId).toBeDefined();

    // Create CONCURRENT_USERS distinct customers
    const passwordHash = await bcrypt.hash('TestPass123!', 4);
    const users = await Promise.all(
      Array.from({ length: CONCURRENT_USERS }, (_, i) =>
        prisma.user.create({
          data: {
            name: `User ${i}`,
            email: `user${i}@concurrent.test`,
            passwordHash,
            role: 'customer',
          },
        }),
      ),
    );

    // Login all users concurrently to get tokens
    const loginResults = await Promise.all(
      users.map((u) =>
        request.post('/api/auth/login').send({ email: u.email, password: 'TestPass123!' }),
      ),
    );
    const tokens = loginResults.map(
      (r) => (r.body as { data: { accessToken: string } }).data.accessToken,
    );

    // ── Fire 10 simultaneous reserve requests ─────────────────────────────────
    const results = await Promise.all(
      tokens.map((token) =>
        request
          .post('/api/bookings/reserve')
          .set('Authorization', `Bearer ${token}`)
          .send({ showtimeId: showtime.id, seatIds: [targetSeatId] }),
      ),
    );

    // ── Assertions ────────────────────────────────────────────────────────────

    const successes = results.filter((r) => r.status === 201);
    const conflicts = results.filter((r) => r.status === 409);

    // Exactly 1 request must succeed
    expect(successes).toHaveLength(1);

    // All remaining 9 must receive 409
    expect(conflicts).toHaveLength(CONCURRENT_USERS - 1);

    // The 409 responses must have a meaningful error code
    conflicts.forEach((r) => {
      const code = (r.body as { error: { code: string } }).error.code;
      expect(['HOLD_CONFLICT', 'SEAT_UNAVAILABLE']).toContain(code);
    });

    // ── Database integrity check ───────────────────────────────────────────────
    // The target seat must have exactly 1 held (or booked) row — not 2
    const heldCount = await prisma.seatInventory.count({
      where: { seatId: targetSeatId, status: { in: ['held', 'booked'] } },
    });

    expect(heldCount).toBe(1);

    // The total number of booking records created must be 1
    const bookingCount = await prisma.booking.count({
      where: { showtimeId: showtime.id },
    });
    expect(bookingCount).toBe(1);
  });

  it('allows all requests to succeed when they target different seats', async () => {
    const adminToken = await createAdminAndGetToken();

    // 3 seats, 3 users — each books a different seat
    const screen = await createScreen(adminToken, 'MultiSeatScreen', 3, 1);
    const movie = await createMovie(adminToken, 'Multi Seat Movie');
    const showtime = await createShowtime(adminToken, movie.id, screen.id);
    const allSeatIds = await getSeatIds(showtime.id, adminToken, 3);

    const passwordHash = await bcrypt.hash('TestPass123!', 4);
    const users = await Promise.all(
      allSeatIds.map((_, i) =>
        prisma.user.create({
          data: {
            name: `UserM${i}`,
            email: `userm${i}@concurrent.test`,
            passwordHash,
            role: 'customer',
          },
        }),
      ),
    );

    const loginResults = await Promise.all(
      users.map((u) =>
        request.post('/api/auth/login').send({ email: u.email, password: 'TestPass123!' }),
      ),
    );
    const tokens = loginResults.map(
      (r) => (r.body as { data: { accessToken: string } }).data.accessToken,
    );

    // Each user requests a different seat
    const results = await Promise.all(
      tokens.map((token, i) =>
        request
          .post('/api/bookings/reserve')
          .set('Authorization', `Bearer ${token}`)
          .send({ showtimeId: showtime.id, seatIds: [allSeatIds[i]] }),
      ),
    );

    const successes = results.filter((r) => r.status === 201);
    expect(successes).toHaveLength(3);
  });
});
