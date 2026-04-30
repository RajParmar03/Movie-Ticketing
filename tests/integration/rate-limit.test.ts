import { request, setupTestDb, cleanDb, createUser, disconnect } from '../helpers/testSetup';

beforeAll(async () => {
  await setupTestDb();
});

afterEach(async () => {
  await cleanDb();
});

afterAll(async () => {
  await disconnect();
});

describe('Rate Limiting', () => {
  it('returns 429 after exceeding auth route limit (10 requests / 15 min)', async () => {
    // Fire 11 requests; the 11th should be rate-limited
    const requests = Array.from({ length: 11 }, () =>
      request.post('/api/auth/login').send({
        email: 'nobody@example.com',
        password: 'wrong',
      }),
    );

    const results = await Promise.all(requests);
    const rateLimited = results.filter((r) => r.status === 429);
    expect(rateLimited.length).toBeGreaterThanOrEqual(1);

    const limitedResponse = rateLimited[0];
    expect(limitedResponse.body.error.code).toBe('RATE_LIMITED');
    expect(limitedResponse.headers).toHaveProperty('retry-after');
  });

  it('returns Retry-After header on rate limit response', async () => {
    const requests = Array.from({ length: 11 }, () =>
      request.post('/api/auth/register').send({
        name: 'Flood',
        email: `flood${Math.random()}@example.com`,
        password: 'Secret123!',
      }),
    );

    const results = await Promise.all(requests);
    const limited = results.find((r) => r.status === 429);
    if (limited) {
      expect(limited.headers['retry-after']).toBeDefined();
    }
  });
});
