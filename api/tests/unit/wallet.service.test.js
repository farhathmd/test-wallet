import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  InsufficientBalanceError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../src/domain/errors.js';
import { createWalletService } from '../../src/services/wallet.service.js';
import { createInMemoryWallet } from '../helpers/fake-repositories.js';

/**
 * The wallet service owns the money rules, so these tests pin down what happens to balances and to
 * the ledger for every path: success, validation failure, unknown recipient and insufficient funds.
 * Concurrency against real Postgres is covered by tests/integration/concurrency.test.js.
 */
function createTestWallet() {
  const wallet = createInMemoryWallet({
    users: [
      { username: 'alice', balance: 100 },
      { username: 'bob', balance: 0 },
    ],
  });
  const service = createWalletService({
    userRepository: wallet.userRepository,
    unitOfWork: wallet.unitOfWork,
  });
  return { service, wallet };
}

describe('services/wallet.service', () => {
  describe('topup', () => {
    it('increases the balance and records a topup ledger row without a sender', async () => {
      const { service, wallet } = createTestWallet();

      const balance = await service.topup({ userId: 1, amount: 25.5 });

      assert.equal(balance, 125.5);
      assert.equal(wallet.balanceOf(1), 125.5);
      assert.deepEqual(wallet.ledger(), [
        {
          id: 1,
          type: 'topup',
          fromUserId: null,
          toUserId: 1,
          amount: 25.5,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
    });

    it('accepts the largest documented amount (9,999,999.99)', async () => {
      const { service } = createTestWallet();

      assert.equal(await service.topup({ userId: 2, amount: 9_999_999.99 }), 9_999_999.99);
    });

    it('rejects invalid amounts without touching the balance or the ledger', async () => {
      const { service, wallet } = createTestWallet();

      for (const amount of [0, -5, 10_000_000, 1.005, '100', null, undefined]) {
        await assert.rejects(() => service.topup({ userId: 1, amount }), ValidationError);
      }
      assert.equal(wallet.balanceOf(1), 100);
      assert.deepEqual(wallet.ledger(), []);
    });

    it('fails for a user that no longer exists', async () => {
      const { service } = createTestWallet();

      await assert.rejects(() => service.topup({ userId: 999, amount: 10 }), NotFoundError);
    });

    it('accumulates cents exactly across many small topups', async () => {
      const { service, wallet } = createTestWallet();

      for (let i = 0; i < 3; i += 1) {
        await service.topup({ userId: 2, amount: 0.1 });
      }

      assert.equal(wallet.balanceOf(2), 0.3);
    });
  });

  describe('getBalance', () => {
    it('returns the stored balance', async () => {
      const { service } = createTestWallet();

      assert.equal(await service.getBalance({ userId: 1 }), 100);
      assert.equal(await service.getBalance({ userId: 2 }), 0);
    });

    it('rejects a token for a deleted user', async () => {
      const { service } = createTestWallet();

      await assert.rejects(() => service.getBalance({ userId: 999 }), UnauthorizedError);
    });
  });

  describe('transfer', () => {
    it('moves the money, records one transfer row and returns the sender balance', async () => {
      const { service, wallet } = createTestWallet();

      const balance = await service.transfer({ fromUserId: 1, toUsername: 'bob', amount: 30.25 });

      assert.equal(balance, 69.75);
      assert.equal(wallet.balanceOf(1), 69.75);
      assert.equal(wallet.balanceOf(2), 30.25);
      assert.equal(wallet.ledger().length, 1);
      assert.deepEqual(wallet.ledger()[0], {
        id: 1,
        type: 'transfer',
        fromUserId: 1,
        toUserId: 2,
        amount: 30.25,
        createdAt: '2026-01-01T00:00:00.000Z',
      });
    });

    it('normalises the recipient username', async () => {
      const { service, wallet } = createTestWallet();

      await service.transfer({ fromUserId: 1, toUsername: '  BOB  ', amount: 1 });

      assert.equal(wallet.balanceOf(2), 1);
    });

    it('allows transferring the exact remaining balance', async () => {
      const { service, wallet } = createTestWallet();

      await service.transfer({ fromUserId: 1, toUsername: 'bob', amount: 100 });

      assert.equal(wallet.balanceOf(1), 0);
      assert.equal(wallet.balanceOf(2), 100);
    });

    it('refuses to overdraw and leaves both wallets and the ledger untouched', async () => {
      const { service, wallet } = createTestWallet();

      await assert.rejects(
        () => service.transfer({ fromUserId: 1, toUsername: 'bob', amount: 100.01 }),
        (error) => {
          assert.ok(error instanceof InsufficientBalanceError);
          assert.equal(error.status, 400);
          assert.deepEqual(error.details, { balance: 100, requested: 100.01 });
          return true;
        },
      );
      assert.equal(wallet.balanceOf(1), 100);
      assert.equal(wallet.balanceOf(2), 0);
      assert.deepEqual(wallet.ledger(), []);
    });

    it('rejects an unknown recipient', async () => {
      const { service, wallet } = createTestWallet();

      await assert.rejects(
        () => service.transfer({ fromUserId: 1, toUsername: 'nobody', amount: 1 }),
        NotFoundError,
      );
      assert.equal(wallet.balanceOf(1), 100);
    });

    it('rejects a self transfer', async () => {
      const { service, wallet } = createTestWallet();

      await assert.rejects(
        () => service.transfer({ fromUserId: 1, toUsername: 'ALICE', amount: 1 }),
        /Cannot transfer to yourself/,
      );
      assert.equal(wallet.balanceOf(1), 100);
      assert.deepEqual(wallet.ledger(), []);
    });

    it('rejects an invalid amount before looking at the recipient', async () => {
      const { service, wallet } = createTestWallet();

      await assert.rejects(
        () => service.transfer({ fromUserId: 1, toUsername: 'bob', amount: 0.001 }),
        ValidationError,
      );
      assert.equal(wallet.balanceOf(2), 0);
    });

    it('rejects a sender that no longer exists', async () => {
      const { service } = createTestWallet();

      await assert.rejects(
        () => service.transfer({ fromUserId: 999, toUsername: 'bob', amount: 1 }),
        UnauthorizedError,
      );
    });

    it('keeps cents exact over repeated transfers', async () => {
      const { service, wallet } = createTestWallet();
      await service.topup({ userId: 1, amount: 0.3 });

      await service.transfer({ fromUserId: 1, toUsername: 'bob', amount: 0.1 });
      await service.transfer({ fromUserId: 1, toUsername: 'bob', amount: 0.1 });

      assert.equal(wallet.balanceOf(1), 100.1);
      assert.equal(wallet.balanceOf(2), 0.2);
    });
  });
});
