import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createTestContext } from '../helpers/test-app.js';

/**
 * The tests that justify the locking strategy.
 *
 * Ten simultaneous transfers hit the API at the same moment, on ten separate pool connections. If
 * the balance check and the balance update were not atomic, several of them would pass the check and
 * the wallet would end up overdrawn. The unit tests cannot prove this — only a real database can.
 */
describe('integration: concurrent transfers', () => {
  let context;
  let api;
  let alice;
  let bob;

  const auth = (actor) => ({ Authorization: `Bearer ${actor.token}` });

  const register = async (username) => {
    const response = await api
      .post('/api/v1/register')
      .send({ username, password: 'passw0rd!' })
      .expect(201);
    return { token: response.body.token, id: response.body.id, username: response.body.username };
  };

  const balanceOf = async (actor) =>
    (await api.get('/api/v1/balance').set(auth(actor)).expect(200)).body.balance;

  const transfer = (from, toUsername, amount) =>
    api.post('/api/v1/transfer').set(auth(from)).send({ to_username: toUsername, amount });

  before(async () => {
    context = await createTestContext();
    api = request(context.app);
  });
  after(async () => {
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
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => transfer(alice, 'bob', 30)),
    );

    const succeeded = responses.filter((response) => response.status === 204);
    const rejected = responses.filter((response) => response.status === 400);

    assert.equal(succeeded.length, 3);
    assert.equal(rejected.length, 7);
    for (const response of rejected) {
      assert.equal(response.body.error.code, 'INSUFFICIENT_BALANCE');
    }
    assert.equal(await balanceOf(alice), 10);
    assert.equal(await balanceOf(bob), 190);
  });

  it('stops exactly at zero and never goes negative', async () => {
    // 20 × 10.00 against 100.00: every success must be covered by the balance.
    const responses = await Promise.all(
      Array.from({ length: 20 }, () => transfer(alice, 'bob', 10)),
    );

    assert.equal(responses.filter((r) => r.status === 204).length, 10);
    assert.equal(await balanceOf(alice), 0);

    const { rows } = await context.query('SELECT username, balance FROM users ORDER BY id');
    for (const row of rows) {
      assert.ok(row.balance >= 0, `${row.username} ended with a negative balance`);
    }
  });

  it('does not deadlock when two wallets transfer to each other simultaneously', async () => {
    const responses = await Promise.all([
      ...Array.from({ length: 10 }, () => transfer(alice, 'bob', 50)),
      ...Array.from({ length: 10 }, () => transfer(bob, 'alice', 50)),
    ]);

    for (const response of responses) {
      // A deadlock (Postgres 40P01) would surface as a 500 here.
      assert.ok(response.status < 500, `unexpected status ${response.status}`);
    }
    // How many succeed depends on the interleaving (money coming back in is spendable again), so the
    // invariants to check are conservation and non-negativity, not a count.
    assert.ok(responses.some((response) => response.status === 204));
    const [aliceBalance, bobBalance] = [await balanceOf(alice), await balanceOf(bob)];
    assert.equal(aliceBalance + bobBalance, 200);
    assert.ok(aliceBalance >= 0 && bobBalance >= 0);
  });

  it('keeps the ledger exactly in step with the balances', async () => {
    await Promise.all([
      ...Array.from({ length: 6 }, () => transfer(alice, 'bob', 25)),
      ...Array.from({ length: 6 }, () => transfer(bob, 'alice', 25)),
    ]);

    // Recompute every balance from the ledger alone; any drift means a lost or duplicated entry.
    const { rows } = await context.query(`
      SELECT u.username,
             u.balance,
             COALESCE(SUM(CASE WHEN t.to_user_id = u.id THEN t.amount ELSE -t.amount END), 0) AS from_ledger
      FROM users u
      LEFT JOIN transactions t ON t.from_user_id = u.id OR t.to_user_id = u.id
      GROUP BY u.id, u.username, u.balance
      ORDER BY u.id
    `);

    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.equal(row.balance, row.from_ledger, `ledger and balance disagree for ${row.username}`);
    }
  });
});
