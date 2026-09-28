import supertest from 'supertest';
import { agentFor, createTestContext, TestContext } from './helpers/test-app';

interface Actor {
  token: string;
  id: number;
  username: string;
}

/**
 * The reason a wallet API is interesting: two requests must not be able to spend the same money.
 *
 * These tests fire real concurrent HTTP requests at one Node process and one PostgreSQL database, and
 * then check the invariants rather than the interleaving: the balance never goes negative, money is
 * conserved, and the ledger and the balances always agree. A deadlock (Postgres 40P01) would surface
 * as a 500, which is why every response status is asserted to be below 500.
 */
describe('integration: concurrency', () => {
  let context: TestContext;
  let api: supertest.Agent;
  let alice: Actor;
  let bob: Actor;

  const auth = (actor: Actor) => ({ Authorization: `Bearer ${actor.token}` });

  const register = async (username: string): Promise<Actor> => {
    const response = await api
      .post('/api/v1/register')
      .send({ username, password: 'passw0rd!' })
      .expect(201);
    return { token: response.body.token, id: response.body.id, username: response.body.username };
  };

  const balanceOf = async (actor: Actor): Promise<number> =>
    (await api.get('/api/v1/balance').set(auth(actor)).expect(200)).body.balance;

  const transfer = (from: Actor, toUsername: string, amount: number) =>
    api.post('/api/v1/transfer').set(auth(from)).send({ to_username: toUsername, amount });

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
    await api.post('/api/v1/topup').set(auth(bob)).send({ amount: 100 }).expect(204);
  });

  it('refuses the transfers that would overdraw, no matter how many arrive at once', async () => {
    // 10 × 30.00 against a 100.00 balance: exactly three can succeed.
    const responses = await Promise.all(Array.from({ length: 10 }, () => transfer(alice, 'bob', 30)));

    const succeeded = responses.filter((response) => response.status === 204);
    const rejected = responses.filter((response) => response.status === 400);

    expect(succeeded).toHaveLength(3);
    expect(rejected).toHaveLength(7);
    for (const response of rejected) {
      expect(response.body.error.code).toBe('INSUFFICIENT_BALANCE');
    }
    expect(await balanceOf(alice)).toBe(10);
    expect(await balanceOf(bob)).toBe(190);
  });

  it('stops exactly at zero and never goes negative', async () => {
    // 20 × 10.00 against 100.00: every success must be covered by the balance.
    const responses = await Promise.all(Array.from({ length: 20 }, () => transfer(alice, 'bob', 10)));

    expect(responses.filter((response) => response.status === 204)).toHaveLength(10);
    expect(await balanceOf(alice)).toBe(0);

    const users = await context.rows<{ username: string; balance: string }>(
      'SELECT username, balance FROM users ORDER BY id',
    );
    for (const user of users) {
      expect(Number(user.balance)).toBeGreaterThanOrEqual(0);
    }
  });

  it('does not deadlock when two wallets transfer to each other simultaneously', async () => {
    const responses = await Promise.all([
      ...Array.from({ length: 10 }, () => transfer(alice, 'bob', 50)),
      ...Array.from({ length: 10 }, () => transfer(bob, 'alice', 50)),
    ]);

    for (const response of responses) {
      // A deadlock (Postgres 40P01) would surface as a 500 here.
      expect(response.status).toBeLessThan(500);
    }

    // How many succeed depends on the interleaving (money received back is spendable again), so the
    // invariants to check are conservation and non-negativity, not a count.
    expect(responses.some((response) => response.status === 204)).toBe(true);

    const [aliceBalance, bobBalance] = [await balanceOf(alice), await balanceOf(bob)];
    expect(aliceBalance + bobBalance).toBe(200);
    expect(aliceBalance).toBeGreaterThanOrEqual(0);
    expect(bobBalance).toBeGreaterThanOrEqual(0);
  });

  it('keeps the ledger exactly in step with the balances', async () => {
    await Promise.all([
      ...Array.from({ length: 6 }, () => transfer(alice, 'bob', 25)),
      ...Array.from({ length: 6 }, () => transfer(bob, 'alice', 25)),
    ]);

    // Recompute every balance from the ledger alone; any drift means a lost or duplicated entry.
    const rows = await context.rows<{ username: string; balance: string; from_ledger: string }>(`
      SELECT u.username,
             u.balance,
             COALESCE(SUM(CASE WHEN t.to_user_id = u.id THEN t.amount ELSE -t.amount END), 0) AS from_ledger
      FROM users u
      LEFT JOIN transactions t ON t.from_user_id = u.id OR t.to_user_id = u.id
      GROUP BY u.id, u.username, u.balance
      ORDER BY u.id
    `);

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(Number(row.balance)).toBeCloseTo(Number(row.from_ledger), 2);
    }
  });
});
