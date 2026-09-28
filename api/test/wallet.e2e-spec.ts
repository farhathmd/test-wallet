import supertest from 'supertest';
import { agentFor, createTestContext, TestContext } from './helpers/test-app';

interface Actor {
  token: string;
  id: number;
  username: string;
}

/**
 * End-to-end tests for topups and transfers, including the documented 10,000,000 boundary and the
 * "no money is created or lost" guarantee: after every failure both balances and the ledger must be
 * exactly what they were before.
 */
describe('integration: wallet', () => {
  let context: TestContext;
  let api: supertest.Agent;
  let alice: Actor;
  let bob: Actor;

  const register = async (username: string): Promise<Actor> => {
    const response = await api
      .post('/api/v1/register')
      .send({ username, password: 'passw0rd!' })
      .expect(201);
    return { token: response.body.token, id: response.body.id, username: response.body.username };
  };

  const auth = (actor: Actor) => ({ Authorization: `Bearer ${actor.token}` });

  const balanceOf = async (actor: Actor): Promise<number> =>
    (await api.get('/api/v1/balance').set(auth(actor)).expect(200)).body.balance;

  beforeAll(async () => {
    context = await createTestContext();
    api = agentFor(context.app);
  });

  afterAll(async () => {
    await context.close();
  });

  beforeEach(async () => {
    await context.reset();
    alice = await register('alice');
    bob = await register('bob');
    await api.post('/api/v1/topup').set(auth(alice)).send({ amount: 100 }).expect(204);
  });

  describe('POST /api/v1/topup', () => {
    it('credits the wallet and answers 204 with no body', async () => {
      const response = await api
        .post('/api/v1/topup')
        .set(auth(bob))
        .send({ amount: 25.5 })
        .expect(204);

      expect(response.text).toBe('');
      expect(await balanceOf(bob)).toBe(25.5);
    });

    it('records a topup ledger row without a sender, in the same transaction', async () => {
      await api.post('/api/v1/topup').set(auth(bob)).send({ amount: 10 }).expect(204);

      // ::text, so the assertion also proves the stored scale is exactly 2 — the cents guarantee.
      const rows = await context.rows<{
        type: string;
        from_user_id: number | null;
        to_user_id: number;
        amount: string;
      }>('SELECT type, from_user_id, to_user_id, amount::text AS amount FROM transactions ORDER BY id');

      expect(rows).toEqual([
        { type: 'topup', from_user_id: null, to_user_id: alice.id, amount: '100.00' },
        { type: 'topup', from_user_id: null, to_user_id: bob.id, amount: '10.00' },
      ]);
    });

    it('accepts 9,999,999.99 and rejects 10,000,000.00 as specified', async () => {
      await api.post('/api/v1/topup').set(auth(bob)).send({ amount: 9_999_999.99 }).expect(204);
      expect(await balanceOf(bob)).toBe(9_999_999.99);

      const rejected = await api
        .post('/api/v1/topup')
        .set(auth(bob))
        .send({ amount: 10_000_000 })
        .expect(400);

      expect(rejected.body.error.code).toBe('VALIDATION_ERROR');
      expect(rejected.body.error.message).toMatch(/less than 10000000/);
      expect(await balanceOf(bob)).toBe(9_999_999.99);
    });

    it('rejects zero, negative, too precise and non-numeric amounts', async () => {
      for (const amount of [0, -1, 1.001, '100', null, true]) {
        const response = await api.post('/api/v1/topup').set(auth(bob)).send({ amount }).expect(400);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      }
      expect(await balanceOf(bob)).toBe(0);
    });

    it('requires an amount and authentication', async () => {
      const response = await api.post('/api/v1/topup').set(auth(bob)).send({}).expect(400);
      expect(response.body.error.message).toMatch(/"amount" is required/);

      await api.post('/api/v1/topup').send({ amount: 10 }).expect(401);
      expect(await balanceOf(bob)).toBe(0);
    });
  });

  describe('POST /api/v1/transfer', () => {
    const transfer = (from: Actor, toUsername: string, amount: unknown) =>
      api.post('/api/v1/transfer').set(auth(from)).send({ to_username: toUsername, amount });

    it('moves money between wallets and answers 204', async () => {
      await transfer(alice, 'bob', 40.25).expect(204);

      expect(await balanceOf(alice)).toBe(59.75);
      expect(await balanceOf(bob)).toBe(40.25);
    });

    it('resolves the recipient case-insensitively', async () => {
      await transfer(alice, '  BOB ', 1).expect(204);

      expect(await balanceOf(bob)).toBe(1);
    });

    it('records exactly one ledger row linking both users', async () => {
      await transfer(alice, 'bob', 5).expect(204);

      const rows = await context.rows<{ type: string; from_user_id: number; to_user_id: number }>(
        "SELECT type, from_user_id, to_user_id FROM transactions WHERE type = 'transfer'",
      );

      expect(rows).toEqual([{ type: 'transfer', from_user_id: alice.id, to_user_id: bob.id }]);
    });

    it('rejects a transfer larger than the balance and changes nothing', async () => {
      const response = await transfer(alice, 'bob', 100.01).expect(400);

      expect(response.body.error.code).toBe('INSUFFICIENT_BALANCE');
      expect(response.body.error.details).toEqual({ balance: 100, requested: 100.01 });
      expect(await balanceOf(alice)).toBe(100);
      expect(await balanceOf(bob)).toBe(0);

      const [count] = await context.rows<{ n: number }>(
        "SELECT count(*)::int AS n FROM transactions WHERE type = 'transfer'",
      );
      expect(count.n).toBe(0);
    });

    it('allows spending the exact balance down to zero', async () => {
      await transfer(alice, 'bob', 100).expect(204);

      expect(await balanceOf(alice)).toBe(0);
      expect(await balanceOf(bob)).toBe(100);
    });

    it('returns 404 for an unknown recipient', async () => {
      const response = await transfer(alice, 'ghost', 1).expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(await balanceOf(alice)).toBe(100);
    });

    it('refuses a transfer to yourself', async () => {
      const response = await transfer(alice, 'ALICE', 1).expect(400);

      expect(response.body.error.message).toMatch(/yourself/);
      expect(await balanceOf(alice)).toBe(100);
    });

    it('validates the body before touching any wallet', async () => {
      for (const body of [
        { to_username: 'bob' },
        { to_username: 'bob', amount: 0 },
        { to_username: 'bob', amount: -5 },
        { to_username: 'bob', amount: 10_000_000 },
        { to_username: 'b!b', amount: 5 },
        { amount: 5 },
      ]) {
        await api.post('/api/v1/transfer').set(auth(alice)).send(body).expect(400);
      }
      expect(await balanceOf(alice)).toBe(100);
      expect(await balanceOf(bob)).toBe(0);
    });

    it('requires authentication', async () => {
      await api.post('/api/v1/transfer').send({ to_username: 'bob', amount: 1 }).expect(401);

      expect(await balanceOf(bob)).toBe(0);
    });
  });
});
