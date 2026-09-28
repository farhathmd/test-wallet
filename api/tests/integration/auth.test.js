import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';
import { createTestContext } from '../helpers/test-app.js';

/**
 * End-to-end tests of the documented API contract against a real database: registration, login,
 * token handling and the two "user details" endpoints the dashboard depends on.
 */
describe('integration: auth', () => {
  let context;
  let api;

  before(async () => {
    context = await createTestContext();
    api = request(context.app);
  });
  after(async () => {
    await context.close();
  });

  describe('POST /api/v1/register', () => {
    it('creates a user and returns 201 with the user and a token', async () => {
      const response = await api
        .post('/api/v1/register')
        .send({ username: 'alice', password: 'passw0rd!' })
        .expect(201);

      assert.equal(response.body.username, 'alice');
      assert.equal(response.body.role, 'user');
      assert.equal(response.body.balance, 0);
      assert.equal(typeof response.body.token, 'string');
      assert.ok(response.body.token.split('.').length === 3);
      assert.ok(response.body.id > 0);
      // The password hash is never part of a response.
      assert.equal(JSON.stringify(response.body).includes('scrypt'), false);
    });

    it('normalises the username and rejects a duplicate', async () => {
      await api.post('/api/v1/register').send({ username: 'bob' }).expect(201);
      const conflict = await api.post('/api/v1/register').send({ username: ' BOB ' }).expect(409);

      assert.equal(conflict.body.error.code, 'CONFLICT');
    });

    it('returns 400 for a missing or malformed username', async () => {
      const missing = await api.post('/api/v1/register').send({}).expect(400);
      const invalid = await api.post('/api/v1/register').send({ username: 'a'.repeat(40) }).expect(400);

      assert.equal(missing.body.error.code, 'VALIDATION_ERROR');
      assert.match(invalid.body.error.message, /between 3 and 32/);
    });

    it('returns 400 for malformed JSON', async () => {
      const response = await api
        .post('/api/v1/register')
        .set('Content-Type', 'application/json')
        .send('{"username": ')
        .expect(400);

      assert.equal(response.body.error.code, 'VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/login', () => {
    before(async () => {
      await api
        .post('/api/v1/register')
        .send({ username: 'carol', password: 'passw0rd!' })
        .expect(201);
    });

    it('returns 200 with a usable token', async () => {
      const response = await api
        .post('/api/v1/login')
        .send({ username: 'carol', password: 'passw0rd!' })
        .expect(200);

      assert.equal(response.body.username, 'carol');
      assert.equal(typeof response.body.token, 'string');
    });

    it('returns 401 for a wrong password and for an unknown user', async () => {
      const wrong = await api
        .post('/api/v1/login')
        .send({ username: 'carol', password: 'not-the-password' })
        .expect(401);
      const unknown = await api
        .post('/api/v1/login')
        .send({ username: 'nobody', password: 'not-the-password' })
        .expect(401);

      assert.equal(wrong.body.error.code, 'UNAUTHORIZED');
      assert.deepEqual(wrong.body.error.message, unknown.body.error.message);
    });

    it('returns 401 for a wallet-only account (registered without a password)', async () => {
      await api.post('/api/v1/register').send({ username: 'dave' }).expect(201);

      await api.post('/api/v1/login').send({ username: 'dave', password: 'passw0rd!' }).expect(401);
    });

    it('returns 400 when the password is missing', async () => {
      const response = await api.post('/api/v1/login').send({ username: 'carol' }).expect(400);

      assert.match(response.body.error.message, /"password" is required/);
    });
  });

  describe('GET /api/v1/balance', () => {
    let token;

    before(async () => {
      const response = await api
        .post('/api/v1/register')
        .send({ username: 'erin', password: 'passw0rd!' })
        .expect(201);
      token = response.body.token;
    });

    it('returns the balance for a Bearer token', async () => {
      const response = await api
        .get('/api/v1/balance')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      assert.deepEqual(response.body, { balance: 0 });
    });

    it('returns the balance for a bare token as well', async () => {
      const response = await api.get('/api/v1/balance').set('Authorization', token).expect(200);

      assert.equal(response.body.balance, 0);
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

      assert.equal(response.body.error.code, 'UNAUTHORIZED');
    });
  });

  describe('GET /api/v1/health', () => {
    it('reports the API and database as healthy', async () => {
      const response = await api.get('/api/v1/health').expect(200);

      assert.equal(response.body.status, 'ok');
      assert.equal(response.body.db, 'up');
    });
  });

  describe('unknown routes', () => {
    it('returns a JSON 404 in the standard error shape', async () => {
      const response = await api.get('/api/v1/does-not-exist').expect(404);

      assert.equal(response.body.error.code, 'NOT_FOUND');
    });
  });
});
