import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';
import { ADMIN_CREDENTIALS, createTestContext } from '../helpers/test-app.js';
import { seedAdmin } from '../../src/db/seed-admin.js';

/**
 * End-to-end tests for the dashboard read endpoints: the two rankings and the paginated, filtered
 * ledger listing, plus the admin-only ability to inspect somebody else's ledger.
 *
 * The fixture is a small but complete money flow, so the expectations below can be checked by hand:
 *
 *   alice: topup 500, → bob 100, → carol 50, ← bob 200   (balance 550)
 *   bob:   topup 500, ← alice 100, → alice 200, → carol 25.5, topup 10  (balance 384.5)
 *   carol: ← alice 50, ← bob 25.5                        (balance 75.5)
 */
describe('integration: reporting', () => {
  let context;
  let api;
  let actors;

  const auth = (actor) => ({ Authorization: `Bearer ${actor.token}` });

  const register = async (username) => {
    const response = await api
      .post('/api/v1/register')
      .send({ username, password: 'passw0rd!' })
      .expect(201);
    return { token: response.body.token, id: response.body.id, username: response.body.username };
  };

  const topup = (actor, amount) =>
    api.post('/api/v1/topup').set(auth(actor)).send({ amount }).expect(204);

  const transfer = (from, toUsername, amount) =>
    api
      .post('/api/v1/transfer')
      .set(auth(from))
      .send({ to_username: toUsername, amount })
      .expect(204);

  before(async () => {
    context = await createTestContext();
    api = request(context.app);

    actors = {
      alice: await register('alice'),
      bob: await register('bob'),
      carol: await register('carol'),
    };

    await topup(actors.alice, 500);
    await topup(actors.bob, 500);
    await transfer(actors.alice, 'bob', 100);
    await transfer(actors.alice, 'carol', 50);
    await transfer(actors.bob, 'alice', 200);
    await transfer(actors.bob, 'carol', 25.5);
    await topup(actors.bob, 10);
  });
  after(async () => {
    await context.close();
  });

  describe('GET /api/v1/transactions/top', () => {
    it('lists the largest transactions first, with debits negative', async () => {
      const response = await api
        .get('/api/v1/transactions/top')
        .set(auth(actors.alice))
        .expect(200);

      assert.deepEqual(response.body, [
        { username: 'bob', amount: 200 },
        { username: 'bob', amount: -100 },
        { username: 'carol', amount: -50 },
      ]);
    });

    it('excludes topups, which have no counterparty', async () => {
      const { body } = await api.get('/api/v1/transactions/top').set(auth(actors.bob)).expect(200);

      assert.deepEqual(body, [
        { username: 'alice', amount: -200 },
        { username: 'alice', amount: 100 },
        { username: 'carol', amount: -25.5 },
      ]);
    });

    it('honours ?limit', async () => {
      const { body } = await api
        .get('/api/v1/transactions/top?limit=2')
        .set(auth(actors.alice))
        .expect(200);

      assert.equal(body.length, 2);
    });

    it('returns an empty list (not an error) for a user without transactions', async () => {
      const dave = await register('dave');

      const response = await api.get('/api/v1/transactions/top').set(auth(dave)).expect(200);

      assert.deepEqual(response.body, []);
    });

    it('validates ?limit and requires authentication', async () => {
      await api.get('/api/v1/transactions/top?limit=999').set(auth(actors.alice)).expect(400);
      await api.get('/api/v1/transactions/top').expect(401);
    });
  });

  describe('GET /api/v1/users/top', () => {
    it('ranks users by the total value they sent, highest first', async () => {
      const response = await api.get('/api/v1/users/top').set(auth(actors.alice)).expect(200);

      assert.deepEqual(response.body, [
        { username: 'bob', transacted_value: 225.5 },
        { username: 'alice', transacted_value: 150 },
      ]);
    });

    it('honours ?limit and requires authentication', async () => {
      const { body } = await api.get('/api/v1/users/top?limit=1').set(auth(actors.alice)).expect(200);

      assert.deepEqual(body, [{ username: 'bob', transacted_value: 225.5 }]);
      await api.get('/api/v1/users/top').expect(401);
    });
  });

  describe('GET /api/v1/transactions', () => {
    it('returns the caller ledger newest first, with direction, counterparty and summary', async () => {
      const response = await api.get('/api/v1/transactions').set(auth(actors.alice)).expect(200);

      assert.equal(response.body.total, 4); // 3 transfers + 1 topup
      assert.equal(response.body.page, 1);
      assert.equal(response.body.per_page, 10);
      assert.equal(response.body.total_pages, 1);
      assert.equal(response.body.data.length, 4);
      assert.deepEqual(response.body.summary, {
        credit_total: 700, // 200 received from bob + 500 topup
        debit_total: 150, // 100 sent to bob + 50 sent to carol
        net: 550,
      });

      assert.deepEqual(
        response.body.data.map((row) => [row.direction, row.counterparty, row.amount, row.type]),
        [
          ['credit', 'bob', 200, 'transfer'],
          ['debit', 'carol', 50, 'transfer'],
          ['debit', 'bob', 100, 'transfer'],
          ['credit', null, 500, 'topup'],
        ],
      );
      for (const row of response.body.data) {
        assert.equal(typeof row.id, 'number');
        assert.match(row.created_at, /^\d{4}-\d{2}-\d{2}T/);
      }
    });

    it('paginates in one query per page', async () => {
      const first = await api
        .get('/api/v1/transactions?per_page=2&page=1')
        .set(auth(actors.alice))
        .expect(200);
      const second = await api
        .get('/api/v1/transactions?per_page=2&page=2')
        .set(auth(actors.alice))
        .expect(200);

      assert.equal(first.body.data.length, 2);
      assert.equal(first.body.total, 4);
      assert.equal(first.body.total_pages, 2);
      assert.equal(second.body.data.length, 2);
      const firstIds = first.body.data.map((row) => row.id);
      const secondIds = second.body.data.map((row) => row.id);
      assert.equal(firstIds.some((id) => secondIds.includes(id)), false);
    });

    it('searches counterparties by partial username', async () => {
      const { body } = await api.get('/api/v1/transactions?q=car').set(auth(actors.alice)).expect(200);

      assert.equal(body.total, 1);
      assert.equal(body.data[0].counterparty, 'carol');
    });

    it('filters by direction and type', async () => {
      const debits = await api
        .get('/api/v1/transactions?direction=debit')
        .set(auth(actors.alice))
        .expect(200);
      const topups = await api
        .get('/api/v1/transactions?type=topup')
        .set(auth(actors.alice))
        .expect(200);

      assert.equal(debits.body.total, 2);
      assert.deepEqual(debits.body.summary, { credit_total: 0, debit_total: 150, net: -150 });
      assert.equal(topups.body.total, 1);
      assert.equal(topups.body.data[0].type, 'topup');
    });

    it('filters by date range, treating the end date as inclusive', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

      const inRange = await api
        .get(`/api/v1/transactions?from=${today}&to=${today}`)
        .set(auth(actors.alice))
        .expect(200);
      const future = await api
        .get(`/api/v1/transactions?from=${tomorrow}`)
        .set(auth(actors.alice))
        .expect(200);

      assert.equal(inRange.body.total, 4);
      assert.equal(future.body.total, 0);
      assert.deepEqual(future.body.data, []);
      assert.deepEqual(future.body.summary, { credit_total: 0, debit_total: 0, net: 0 });
      assert.equal(future.body.total_pages, 1);
    });

    it('rejects invalid filters and paging with 400', async () => {
      const queries = [
        'type=refund',
        'direction=sideways',
        'from=2026-13-01',
        'from=2026-02-01&to=2026-01-01',
        'page=0',
        'per_page=1000',
        `q=${'x'.repeat(65)}`,
      ];
      for (const query of queries) {
        await api.get(`/api/v1/transactions?${query}`).set(auth(actors.alice)).expect(400);
      }
    });

    it('returns an empty page for a user without transactions', async () => {
      const erin = await register('erin');

      const { body } = await api.get('/api/v1/transactions').set(auth(erin)).expect(200);

      assert.deepEqual(body.data, []);
      assert.equal(body.total, 0);
      assert.equal(body.total_pages, 1);
      assert.deepEqual(body.summary, { credit_total: 0, debit_total: 0, net: 0 });
    });

    it('requires authentication', async () => {
      await api.get('/api/v1/transactions').expect(401);
    });
  });

  describe('admin access to another wallet', () => {
    let admin;

    before(async () => {
      // Seed through the same code path production uses (npm run seed / boot), then log in over HTTP.
      await seedAdmin({
        pool: context.pool,
        admin: ADMIN_CREDENTIALS,
        passwordService: context.passwordService,
        logger: { info() {} },
      });
      const login = await api.post('/api/v1/login').send(ADMIN_CREDENTIALS).expect(200);
      assert.equal(login.body.role, 'admin');
      admin = { token: login.body.token, username: login.body.username };
    });

    it('lets an admin inspect another wallet, from that wallet point of view', async () => {
      const response = await api
        .get('/api/v1/transactions?username=bob')
        .set(auth(admin))
        .expect(200);

      assert.equal(response.body.total, 5);
      assert.deepEqual(response.body.summary, {
        credit_total: 610, // 100 received from alice + 500 and 10 topups
        debit_total: 225.5, // 200 sent to alice + 25.5 sent to carol
        net: 384.5,
      });
      assert.deepEqual(
        response.body.data
          .filter((row) => row.direction === 'debit')
          .map((row) => row.counterparty)
          .sort(),
        ['alice', 'carol'],
      );
    });

    it('refuses the same request from a normal user', async () => {
      const response = await api
        .get('/api/v1/transactions?username=bob')
        .set(auth(actors.alice))
        .expect(403);

      assert.equal(response.body.error.code, 'FORBIDDEN');
    });

    it('answers 404 for an unknown wallet', async () => {
      await api.get('/api/v1/transactions?username=ghost').set(auth(admin)).expect(404);
    });
  });
});
