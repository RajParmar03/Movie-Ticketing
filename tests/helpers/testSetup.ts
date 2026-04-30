import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import supertest from 'supertest';
import app from '../../src/app';

process.env.NODE_ENV = 'test';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_TEST } },
});

export { prisma };
export const request = supertest(app);

export async function setupTestDb(): Promise<void> {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL_TEST },
    stdio: 'pipe',
  });
}

export async function cleanDb(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      booked_seats, payments, bookings, seat_inventory,
      showtimes, seats, screens, movies, refresh_tokens, users
    RESTART IDENTITY CASCADE
  `);
}

export async function createUser(
  email: string,
  role: 'admin' | 'customer' = 'customer',
  password = 'TestPass123!',
) {
  const passwordHash = await bcrypt.hash(password, 4);
  return prisma.user.create({ data: { name: 'Test User', email, passwordHash, role } });
}

export async function loginUser(email: string, password = 'TestPass123!'): Promise<string> {
  const res = await request.post('/api/auth/login').send({ email, password });
  return (res.body as { data: { accessToken: string } }).data.accessToken;
}

export async function createAdminAndGetToken(): Promise<string> {
  await createUser('admin@test.com', 'admin');
  return loginUser('admin@test.com');
}

export async function createCustomerAndGetToken(
  email = 'customer@test.com',
): Promise<{ token: string; userId: string }> {
  const user = await createUser(email);
  const token = await loginUser(email);
  return { token, userId: user.id };
}

export async function createScreen(
  adminToken: string,
  name = 'Test Screen',
  rows = 3,
  seatsPerRow = 3,
) {
  const rowLabels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.slice(0, rows).split('');
  const res = await request
    .post('/api/screens')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name,
      rows,
      seatsPerRow,
      rowTypeMapping: {
        standard: rowLabels,
        premium: [],
        vip: [],
      },
    });
  return (res.body as { data: { screen: { id: string } } }).data.screen;
}

export async function createMovie(adminToken: string, title = 'Test Movie') {
  const res = await request
    .post('/api/movies')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      title,
      description: 'A test movie',
      genre: 'Action',
      language: 'English',
      durationMinutes: 120,
      rating: 'UA',
      releaseDate: '2025-01-01',
    });
  return (res.body as { data: { movie: { id: string } } }).data.movie;
}

export async function createShowtime(adminToken: string, movieId: string, screenId: string) {
  const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const endsAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

  const res = await request
    .post('/api/showtimes')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ movieId, screenId, startsAt, endsAt, basePrice: 200 });
  return (res.body as { data: { showtime: { id: string } } }).data.showtime;
}

export async function getSeatIds(showtimeId: string, adminToken: string, count = 1) {
  const res = await request
    .get(`/api/showtimes/${showtimeId}/seats`)
    .set('Authorization', `Bearer ${adminToken}`);
  const seats = (
    res.body as { data: { seats: Array<{ seatId: string; status: string }> } }
  ).data.seats.filter((s) => s.status === 'available');
  return seats.slice(0, count).map((s) => s.seatId);
}

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
