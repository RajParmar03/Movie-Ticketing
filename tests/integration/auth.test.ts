import {
  request,
  setupTestDb,
  cleanDb,
  createUser,
  loginUser,
  disconnect,
} from '../helpers/testSetup';

beforeAll(async () => {
  await setupTestDb();
});

afterEach(async () => {
  await cleanDb();
});

afterAll(async () => {
  await disconnect();
});

describe('POST /api/auth/register', () => {
  it('registers a new user and returns 201', async () => {
    const res = await request.post('/api/auth/register').send({
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'Secret123!',
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe('jane@example.com');
    expect(res.body.data.user.role).toBe('customer');
  });

  it('returns 409 when email is already registered', async () => {
    await createUser('dup@example.com');
    const res = await request.post('/api/auth/register').send({
      name: 'Dup',
      email: 'dup@example.com',
      password: 'Secret123!',
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('returns 400 for invalid email', async () => {
    const res = await request.post('/api/auth/register').send({
      name: 'Bad',
      email: 'not-an-email',
      password: 'Secret123!',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when password is too short', async () => {
    const res = await request.post('/api/auth/register').send({
      name: 'Bad',
      email: 'bad@example.com',
      password: 'short',
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('returns access and refresh tokens on valid credentials', async () => {
    await createUser('login@example.com');
    const res = await request.post('/api/auth/login').send({
      email: 'login@example.com',
      password: 'TestPass123!',
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
    expect(res.body.data.expiresIn).toBe(900);
  });

  it('returns 401 for wrong password', async () => {
    await createUser('user@example.com');
    const res = await request.post('/api/auth/login').send({
      email: 'user@example.com',
      password: 'WrongPassword!',
    });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns 401 for non-existent email', async () => {
    const res = await request.post('/api/auth/login').send({
      email: 'nobody@example.com',
      password: 'TestPass123!',
    });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/refresh', () => {
  it('issues a new access token from a valid refresh token', async () => {
    await createUser('refresh@example.com');
    const loginRes = await request.post('/api/auth/login').send({
      email: 'refresh@example.com',
      password: 'TestPass123!',
    });
    const { refreshToken } = (loginRes.body as { data: { refreshToken: string } }).data;

    const res = await request.post('/api/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('accessToken');
  });

  it('returns 401 for an invalid refresh token', async () => {
    const res = await request.post('/api/auth/refresh').send({ refreshToken: 'not-a-real-token' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('invalidates the refresh token', async () => {
    await createUser('logout@example.com');
    const loginRes = await request.post('/api/auth/login').send({
      email: 'logout@example.com',
      password: 'TestPass123!',
    });
    const { accessToken, refreshToken } = (
      loginRes.body as { data: { accessToken: string; refreshToken: string } }
    ).data;

    const logoutRes = await request
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken });
    expect(logoutRes.status).toBe(200);

    // Attempt to use the revoked refresh token
    const refreshRes = await request.post('/api/auth/refresh').send({ refreshToken });
    expect(refreshRes.status).toBe(401);
  });
});
