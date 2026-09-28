import supertest from 'supertest';
import { agentFor, createTestContext, TestContext } from './helpers/test-app';

/**
 * End-to-end tests of the documented API contract against a real database: registration, login, token
 * handling, the health probe and the error shape for an unknown route.
 *
 * These run through the real application — real guards, real exception filter, real Prisma — so a
 * wiring mistake fails here even when every unit test passes.
 */
describe('integration: auth', () => {
  let context: TestContext;
  let api: supertest.Agent;

  beforeAll(async () => {
    context = await createTestContext();
    api = agentFor(context.app);
  });

  afterAll(async () => {
    await context.close();
  });

  describe('POST /api/v1/register', () => {
    it('creates a user and returns 201 with the user and a token', async () => {
      const response = await api
        .post('/api/v1/register')
        .send({ username: 'alice', password: 'passw0rd!' })
        .expect(201);

      expect(response.body.username).toBe('alice');
      expect(response.body.role).toBe('user');
      expect(response.body.balance).toBe(0);
      expect(typeof response.body.token).toBe('string');
      expect(response.body.token.split('.')).toHaveLength(3);
      expect(response.body.id).toBeGreaterThan(0);
      // The password hash is never part of a response.
      expect(JSON.stringify(response.body)).not.toContain('scrypt');
    });

    it('normalises the username and rejects a duplicate', async () => {
      await api.post('/api/v1/register').send({ username: 'bob' }).expect(201);

      const conflict = await api.post('/api/v1/register').send({ username: ' BOB ' }).expect(409);

      expect(conflict.body.error.code).toBe('CONFLICT');
    });

    it('returns 400 for a missing or malformed username', async () => {
      const missing = await api.post('/api/v1/register').send({}).expect(400);
      const invalid = await api.post('/api/v1/register').send({ username: 'a'.repeat(40) }).expect(400);

      expect(missing.body.error.code).toBe('VALIDATION_ERROR');
      expect(invalid.body.error.message).toMatch(/between 3 and 32/);
    });

    it('returns 400 for malformed JSON', async () => {
      const response = await api
        .post('/api/v1/register')
        .set('Content-Type', 'application/json')
        .send('{"username": ')
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/login', () => {
    beforeAll(async () => {
      await api.post('/api/v1/register').send({ username: 'carol', password: 'passw0rd!' }).expect(201);
    });

    it('returns 200 with a usable token', async () => {
      const response = await api
        .post('/api/v1/login')
        .send({ username: 'carol', password: 'passw0rd!' })
        .expect(200);

      expect(response.body.username).toBe('carol');
      expect(typeof response.body.token).toBe('string');
    });

    it('returns 401 for a wrong password and for an unknown user, with the same message', async () => {
      const wrong = await api
        .post('/api/v1/login')
        .send({ username: 'carol', password: 'not-the-password' })
        .expect(401);
      const unknown = await api
        .post('/api/v1/login')
        .send({ username: 'nobody', password: 'not-the-password' })
        .expect(401);

      expect(wrong.body.error.code).toBe('UNAUTHORIZED');
      expect(wrong.body.error.message).toEqual(unknown.body.error.message);
    });

    it('returns 401 for a wallet-only account (registered without a password)', async () => {
      await api.post('/api/v1/register').send({ username: 'dave' }).expect(201);

      await api.post('/api/v1/login').send({ username: 'dave', password: 'passw0rd!' }).expect(401);
    });

    it('returns 400 when the password is missing', async () => {
      const response = await api.post('/api/v1/login').send({ username: 'carol' }).expect(400);

      expect(response.body.error.message).toMatch(/"password" is required/);
    });
  });

  describe('GET /api/v1/balance', () => {
    let token: string;

    beforeAll(async () => {
      const response = await api
        .post('/api/v1/register')
        .send({ username: 'erin', password: 'passw0rd!' })
        .expect(201);
      token = response.body.token;
    });

    it('returns the balance for a Bearer token', async () => {
      const response = await api.get('/api/v1/balance').set('Authorization', `Bearer ${token}`).expect(200);

      expect(response.body).toEqual({ balance: 0 });
    });

    it('returns the balance for a bare token as well', async () => {
      const response = await api.get('/api/v1/balance').set('Authorization', token).expect(200);

      expect(response.body.balance).toBe(0);
    });

    it('returns 401 without a token, with a bad token and with a foreign token', async () => {
      await api.get('/api/v1/balance').expect(401);
      await api.get('/api/v1/balance').set('Authorization', 'Bearer nonsense').expect(401);

      const foreign = [
        Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
        Buffer.from(JSON.stringify({ sub: '1', username: 'x' })).toString('base64url'),
        'signature',
      ].join('.');
      const response = await api.get('/api/v1/balance').set('Authorization', foreign).expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('GET /api/v1/health', () => {
    it('reports the API and the database as healthy', async () => {
      const response = await api.get('/api/v1/health').expect(200);

      expect(response.body).toEqual({ status: 'ok', db: 'up' });
    });
  });

  describe('unknown routes', () => {
    it('returns a JSON 404 in the standard error shape', async () => {
      const response = await api.get('/api/v1/does-not-exist').expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });
});
