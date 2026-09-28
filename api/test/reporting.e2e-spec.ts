import supertest from 'supertest';
import { adminCredentials, agentFor, createTestContext, TestContext } from './helpers/test-app';

interface Actor {
  token: string;
  id: number;
  username: string;
}

/**
 * End-to-end tests for the dashboard read endpoints: the two rankings and the paginated, filtered
 * ledger, plus the admin-only ability to inspect somebody else's ledger.
 *
 * The fixture is a small but complete money flow, so the expectations below can be checked by hand:
 *
 *   alice: topup 500, → bob 100, → carol 50, ← bob 200                  (balance 550)
 *   bob:   topup 500, ← alice 100, → alice 200, → carol 25.5, topup 10  (balance 384.5)
 *   carol: ← alice 50, ← bob 25.5                                      (balance 75.5)
 */
describe('integration: reporting', () => {
  let context: TestContext;
  let api: supertest.Agent;
  let actors: Record<'alice' | 'bob' | 'carol', Actor>;

  const auth = (actor: Actor) => ({ Authorization: `Bearer ${actor.token}` });

  const register = async (username: string): Promise<Actor> => {
    const response = await api
      .post('/api/v1/register')
      .send({ username, password: 'passw0rd!' })
      .expect(201);
    return { token: response.body.token, id: response.body.id, username: response.body.username };
  };

  const topup = (actor: Actor, amount: number) =>
    api.post('/api/v1/topup').set(auth(actor)).send({ amount }).expect(204);

  const transfer = (from: Actor, toUsername: string, amount: number) =>
    api
      .post('/api/v1/transfer')
      .set(auth(from))
      .send({ to_username: toUsername, amount })
      .expect(204);

  beforeAll(async () => {
    context = await createTestContext();
    api = agentFor(context.app);

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

  afterAll(async () => {
    await context.close();
  });

  describe('GET /api/v1/transactions/top', () => {
    it('lists the largest transactions first, with debits negative', async () => {
      const response = await api.get('/api/v1/transactions/top').set(auth(actors.alice)).expect(200);

      expect(response.body).toEqual([
        { username: 'bob', amount: 200 },
        { username: 'bob', amount: -100 },
        { username: 'carol', amount: -50 },
      ]);
    });

    it('excludes topups, which have no counterparty', async () => {
      const { body } = await api.get('/api/v1/transactions/top').set(auth(actors.bob)).expect(200);

      expect(body).toEqual([
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

      expect(body).toHaveLength(2);
    });

    it('returns an empty list — not an error — for a user without transactions', async () => {
      const dave = await register('dave');

      const response = await api.get('/api/v1/transactions/top').set(auth(dave)).expect(200);

      expect(response.body).toEqual([]);
    });

    it('validates ?limit and requires authentication', async () => {
      await api.get('/api/v1/transactions/top?limit=999').set(auth(actors.alice)).expect(400);
      await api.get('/api/v1/transactions/top').expect(401);
    });
  });

  describe('GET /api/v1/users/top', () => {
    it('ranks users by the total value they sent, highest first', async () => {
      const response = await api.get('/api/v1/users/top').set(auth(actors.alice)).expect(200);

      expect(response.body).toEqual([
        { username: 'bob', transacted_value: 225.5 },
        { username: 'alice', transacted_value: 150 },
      ]);
    });

    it('honours ?limit and requires authentication', async () => {
      const { body } = await api.get('/api/v1/users/top?limit=1').set(auth(actors.alice)).expect(200);

      expect(body).toEqual([{ username: 'bob', transacted_value: 225.5 }]);
      await api.get('/api/v1/users/top').expect(401);
    });
  });

  describe('GET /api/v1/transactions', () => {
    it('returns the caller ledger newest first, with direction, counterparty and summary', async () => {
      const response = await api.get('/api/v1/transactions').set(auth(actors.alice)).expect(200);

      expect(response.body.total).toBe(4); // 3 transfers + 1 topup
      expect(response.body.page).toBe(1);
      expect(response.body.per_page).toBe(10);
      expect(response.body.total_pages).toBe(1);
      expect(response.body.summary).toEqual({
        credit_total: 700, // 200 received from bob + 500 topup
        debit_total: 150, // 100 sent to bob + 50 sent to carol
        net: 550,
      });

      const rows = response.body.data.map((row: Record<string, unknown>) => [
        row.direction,
        row.counterparty,
        row.amount,
        row.type,
      ]);
      expect(rows).toEqual([
        ['credit', 'bob', 200, 'transfer'],
        ['debit', 'carol', 50, 'transfer'],
        ['debit', 'bob', 100, 'transfer'],
        ['credit', null, 500, 'topup'],
      ]);

      for (const row of response.body.data) {
        expect(typeof row.id).toBe('number');
        expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      }
    });

    it('paginates without repeating or skipping a row', async () => {
      const first = await api
        .get('/api/v1/transactions?per_page=2&page=1')
        .set(auth(actors.alice))
        .expect(200);
      const second = await api
        .get('/api/v1/transactions?per_page=2&page=2')
        .set(auth(actors.alice))
        .expect(200);

      expect(first.body.data).toHaveLength(2);
      expect(first.body.total).toBe(4);
      expect(first.body.total_pages).toBe(2);
      expect(second.body.data).toHaveLength(2);

      const firstIds = first.body.data.map((row: { id: number }) => row.id);
      const secondIds = second.body.data.map((row: { id: number }) => row.id);
      expect(firstIds.some((id: number) => secondIds.includes(id))).toBe(false);
    });

    it('searches counterparties by partial username', async () => {
      const { body } = await api.get('/api/v1/transactions?q=car').set(auth(actors.alice)).expect(200);

      expect(body.total).toBe(1);
      expect(body.data[0].counterparty).toBe('carol');
    });

    it('filters by direction and type, keeping the summary consistent with the filter', async () => {
      const debits = await api
        .get('/api/v1/transactions?direction=debit')
        .set(auth(actors.alice))
        .expect(200);
      const topups = await api
        .get('/api/v1/transactions?type=topup')
        .set(auth(actors.alice))
        .expect(200);

      expect(debits.body.total).toBe(2);
      expect(debits.body.summary).toEqual({ credit_total: 0, debit_total: 150, net: -150 });
      expect(topups.body.total).toBe(1);
      expect(topups.body.data[0].type).toBe('topup');
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

      expect(inRange.body.total).toBe(4);
      expect(future.body.total).toBe(0);
      expect(future.body.data).toEqual([]);
      expect(future.body.summary).toEqual({ credit_total: 0, debit_total: 0, net: 0 });
      expect(future.body.total_pages).toBe(1);
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

      expect(body.data).toEqual([]);
      expect(body.total).toBe(0);
      expect(body.total_pages).toBe(1);
      expect(body.summary).toEqual({ credit_total: 0, debit_total: 0, net: 0 });
    });

    it('requires authentication', async () => {
      await api.get('/api/v1/transactions').expect(401);
    });
  });

  describe('admin access to another wallet', () => {
    let admin: Actor;

    beforeAll(async () => {
      // Seeded through the same code path production uses (boot / npm run seed), then logged in over HTTP.
      await context.seedAdmin();
      const login = await api.post('/api/v1/login').send(adminCredentials(context.app)).expect(200);

      expect(login.body.role).toBe('admin');
      admin = { token: login.body.token, id: login.body.id, username: login.body.username };
    });

    it('lets an admin inspect another wallet, from that wallet point of view', async () => {
      const response = await api.get('/api/v1/transactions?username=bob').set(auth(admin)).expect(200);

      expect(response.body.total).toBe(5);
      expect(response.body.summary).toEqual({
        credit_total: 610, // 100 received from alice + 500 and 10 topups
        debit_total: 225.5, // 200 sent to alice + 25.5 sent to carol
        net: 384.5,
      });

      const counterparties = response.body.data
        .filter((row: { direction: string }) => row.direction === 'debit')
        .map((row: { counterparty: string }) => row.counterparty)
        .sort();
      expect(counterparties).toEqual(['alice', 'carol']);
    });

    it('refuses the same request from a normal user', async () => {
      const response = await api
        .get('/api/v1/transactions?username=bob')
        .set(auth(actors.alice))
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('answers an own-wallet request from a normal user normally, in any casing', async () => {
      const response = await api
        .get(`/api/v1/transactions?username=${actors.alice.username.toUpperCase()}`)
        .set(auth(actors.alice))
        .expect(200);

      expect(response.body.total).toBe(4);
    });

    it('reports an unknown wallet as 404 for an admin', async () => {
      const response = await api
        .get('/api/v1/transactions?username=ghost')
        .set(auth(admin))
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });
});
