import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createTestContext } from '../helpers/test-app.js';

/**
 * End-to-end tests for topups and transfers, including the documented 10,000,000 boundary and the
 * "no money is created or lost" guarantee: after every failure both balances and the ledger must be
 * exactly what they were before.
 */
describe('integration: wallet', () => {
  let context;
  let api;
  let alice;
  let bob;

  const register = async (username) => {
    const response = await api
      .post('/api/v1/register')
      .send({ username, password: 'passw0rd!' })
      .expect(201);
    return { token: response.body.token, id: response.body.id, username: response.body.username };
  };

  const auth = (actor) => ({ Authorization: `Bearer ${actor.token}` });

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
  });

  const balanceOf = async (actor) => {
    const { body } = await api.get('/api/v1/balance').set(auth(actor)).expect(200);
    return body.balance;
  };

  describe('POST /api/v1/topup', () => {
    it('credits the wallet and answers 204 with no body', async () => {
      const response = await api
        .post('/api/v1/topup')
        .set(auth(bob))
        .send({ amount: 25.5 })
        .expect(204);

      assert.equal(response.text, '');
      assert.equal(await balanceOf(bob), 25.5);
    });

    it('records a topup ledger row without a sender, in the same transaction', async () => {
      await api.post('/api/v1/topup').set(auth(bob)).send({ amount: 10 }).expect(204);

      const { rows } = await context.query(
        'SELECT type, from_user_id, to_user_id, amount FROM transactions ORDER BY id',
      );
      assert.deepEqual(rows, [
        { type: 'topup', from_user_id: null, to_user_id: alice.id, amount: 100 },
        { type: 'topup', from_user_id: null, to_user_id: bob.id, amount: 10 },
      ]);
    });

    it('accepts 9,999,999.99 and rejects 10,000,000.00 as specified', async () => {
      await api
        .post('/api/v1/topup')
        .set(auth(bob))
        .send({ amount: 9_999_999.99 })
        .expect(204);
      assert.equal(await balanceOf(bob), 9_999_999.99);

      const rejected = await api
        .post('/api/v1/topup')
        .set(auth(bob))
        .send({ amount: 10_000_000 })
        .expect(400);

      assert.equal(rejected.body.error.code, 'VALIDATION_ERROR');
      assert.match(rejected.body.error.message, /less than 10000000/);
      assert.equal(await balanceOf(bob), 9_999_999.99);
    });

    it('rejects zero, negative, too precise and non-numeric amounts', async () => {
      for (const amount of [0, -1, 1.001, '100', null, true]) {
        const response = await api
          .post('/api/v1/topup')
          .set(auth(bob))
          .send({ amount })
          .expect(400);
        assert.equal(response.body.error.code, 'VALIDATION_ERROR', `amount=${amount}`);
      }
      assert.equal(await balanceOf(bob), 0);
    });

    it('requires an amount', async () => {
      const response = await api.post('/api/v1/topup').set(auth(bob)).send({}).expect(400);

      assert.match(response.body.error.message, /"amount" is required/);
    });

    it('requires authentication', async () => {
      await api.post('/api/v1/topup').send({ amount: 10 }).expect(401);
      assert.equal(await balanceOf(bob), 0);
    });
  });

  describe('POST /api/v1/transfer', () => {
    it('moves money between wallets and answers 204', async () => {
      await api
        .post('/api/v1/transfer')
        .set(auth(alice))
        .send({ to_username: 'bob', amount: 40.25 })
        .expect(204);

      assert.equal(await balanceOf(alice), 59.75);
      assert.equal(await balanceOf(bob), 40.25);
    });

    it('resolves the recipient case-insensitively', async () => {
      await api
        .post('/api/v1/transfer')
        .set(auth(alice))
        .send({ to_username: '  BOB ', amount: 1 })
        .expect(204);

      assert.equal(await balanceOf(bob), 1);
    });

    it('records exactly one ledger row linking both users', async () => {
      await api
        .post('/api/v1/transfer')
        .set(auth(alice))
        .send({ to_username: 'bob', amount: 5 })
        .expect(204);

      const { rows } = await context.query(
        "SELECT type, from_user_id, to_user_id, amount FROM transactions WHERE type = 'transfer'",
      );
      assert.deepEqual(rows, [
        { type: 'transfer', from_user_id: alice.id, to_user_id: bob.id, amount: 5 },
      ]);
    });

    it('rejects a transfer larger than the balance and changes nothing', async () => {
      const response = await api
        .post('/api/v1/transfer')
        .set(auth(alice))
        .send({ to_username: 'bob', amount: 100.01 })
        .expect(400);

      assert.equal(response.body.error.code, 'INSUFFICIENT_BALANCE');
      assert.deepEqual(response.body.error.details, { balance: 100, requested: 100.01 });
      assert.equal(await balanceOf(alice), 100);
      assert.equal(await balanceOf(bob), 0);
      const { rows } = await context.query("SELECT count(*)::int AS n FROM transactions WHERE type = 'transfer'");
      assert.equal(rows[0].n, 0);
    });

    it('allows spending the exact balance down to zero', async () => {
      await api
        .post('/api/v1/transfer')
        .set(auth(alice))
        .send({ to_username: 'bob', amount: 100 })
        .expect(204);

      assert.equal(await balanceOf(alice), 0);
      assert.equal(await balanceOf(bob), 100);
    });

    it('returns 404 for an unknown recipient', async () => {
      const response = await api
        .post('/api/v1/transfer')
        .set(auth(alice))
        .send({ to_username: 'ghost', amount: 1 })
        .expect(404);

      assert.equal(response.body.error.code, 'NOT_FOUND');
      assert.equal(await balanceOf(alice), 100);
    });

    it('refuses a transfer to yourself', async () => {
      const response = await api
        .post('/api/v1/transfer')
        .set(auth(alice))
        .send({ to_username: 'ALICE', amount: 1 })
        .expect(400);

      assert.match(response.body.error.message, /yourself/);
      assert.equal(await balanceOf(alice), 100);
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
      assert.equal(await balanceOf(alice), 100);
      assert.equal(await balanceOf(bob), 0);
    });

    it('requires authentication', async () => {
      await api.post('/api/v1/transfer').send({ to_username: 'bob', amount: 1 }).expect(401);

      assert.equal(await balanceOf(bob), 0);
    });
  });
});
