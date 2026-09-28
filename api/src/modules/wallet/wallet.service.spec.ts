import {
  InsufficientBalanceError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../domain/errors';
import type { TransactionRepository } from '../../repositories/transaction.repository';
import type { UnitOfWork } from '../../repositories/unit-of-work';
import type { UserRepository } from '../../repositories/user.repository';
import { createInMemoryWallet } from '../../testing/fake-repositories';
import { WalletService } from './wallet.service';

/**
 * The wallet service owns the money rules, so these tests pin down what happens to the balances and to
 * the ledger on every path: success, validation failure, unknown recipient and insufficient funds.
 * Concurrency against real PostgreSQL is covered by test/concurrency.e2e-spec.ts.
 */
function createTestWallet() {
  const wallet = createInMemoryWallet({
    users: [
      { username: 'alice', balance: 100 },
      { username: 'bob', balance: 0 },
    ],
  });
  const service = new WalletService(
    wallet.userRepository as unknown as UserRepository,
    wallet.transactionRepository as unknown as TransactionRepository,
    wallet.unitOfWork as unknown as UnitOfWork,
  );
  return { service, wallet };
}

describe('modules/wallet/wallet.service', () => {
  describe('topup', () => {
    it('increases the balance and records a topup row without a sender', async () => {
      const { service, wallet } = createTestWallet();

      const balance = await service.topup({ userId: 1, amount: 25.5 });

      expect(balance).toBe(125.5);
      expect(wallet.balanceOf(1)).toBe(125.5);
      expect(wallet.ledger()).toEqual([
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

      await expect(service.topup({ userId: 2, amount: 9_999_999.99 })).resolves.toBe(9_999_999.99);
    });

    it('rejects invalid amounts without touching the balance or the ledger', async () => {
      const { service, wallet } = createTestWallet();

      for (const amount of [0, -5, 10_000_000, 1.005, '100', null, undefined]) {
        await expect(service.topup({ userId: 1, amount })).rejects.toThrow(ValidationError);
      }
      expect(wallet.balanceOf(1)).toBe(100);
      expect(wallet.ledger()).toEqual([]);
    });

    it('fails for a user that no longer exists', async () => {
      const { service } = createTestWallet();

      await expect(service.topup({ userId: 999, amount: 10 })).rejects.toThrow(NotFoundError);
    });

    it('accumulates cents exactly across many small topups', async () => {
      const { service, wallet } = createTestWallet();

      for (let i = 0; i < 3; i += 1) {
        await service.topup({ userId: 2, amount: 0.1 });
      }

      expect(wallet.balanceOf(2)).toBe(0.3);
    });
  });

  describe('getBalance', () => {
    it('returns the stored balance', async () => {
      const { service } = createTestWallet();

      await expect(service.getBalance({ userId: 1 })).resolves.toBe(100);
      await expect(service.getBalance({ userId: 2 })).resolves.toBe(0);
    });

    it('rejects a token for a deleted user', async () => {
      const { service } = createTestWallet();

      await expect(service.getBalance({ userId: 999 })).rejects.toThrow(UnauthorizedError);
    });
  });

  describe('transfer', () => {
    it('moves the money, records one transfer row and returns the sender balance', async () => {
      const { service, wallet } = createTestWallet();

      const balance = await service.transfer({ fromUserId: 1, toUsername: 'bob', amount: 30.25 });

      expect(balance).toBe(69.75);
      expect(wallet.balanceOf(1)).toBe(69.75);
      expect(wallet.balanceOf(2)).toBe(30.25);
      expect(wallet.ledger()).toHaveLength(1);
      expect(wallet.ledger()[0]).toEqual({
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

      expect(wallet.balanceOf(2)).toBe(1);
    });

    it('allows transferring the exact remaining balance', async () => {
      const { service, wallet } = createTestWallet();

      await service.transfer({ fromUserId: 1, toUsername: 'bob', amount: 100 });

      expect(wallet.balanceOf(1)).toBe(0);
      expect(wallet.balanceOf(2)).toBe(100);
    });

    it('refuses to overdraw, spells out both amounts, and leaves everything untouched', async () => {
      const { service, wallet } = createTestWallet();

      const refusal = service.transfer({ fromUserId: 1, toUsername: 'bob', amount: 100.01 });
      await expect(refusal).rejects.toThrow(InsufficientBalanceError);
      await expect(refusal).rejects.toMatchObject({
        status: 400,
        details: { balance: 100, requested: 100.01 },
      });
      await expect(refusal).rejects.toThrow('Insufficient balance: 100.00 available, 100.01 requested.');

      expect(wallet.balanceOf(1)).toBe(100);
      expect(wallet.balanceOf(2)).toBe(0);
      expect(wallet.ledger()).toEqual([]);
    });

    it('rejects an unknown recipient', async () => {
      const { service, wallet } = createTestWallet();

      await expect(service.transfer({ fromUserId: 1, toUsername: 'nobody', amount: 1 })).rejects.toThrow(
        NotFoundError,
      );
      expect(wallet.balanceOf(1)).toBe(100);
      expect(wallet.ledger()).toEqual([]);
    });

    it('rejects a self transfer', async () => {
      const { service, wallet } = createTestWallet();

      await expect(service.transfer({ fromUserId: 1, toUsername: 'ALICE', amount: 1 })).rejects.toThrow(
        /Cannot transfer to yourself/,
      );
      expect(wallet.balanceOf(1)).toBe(100);
      expect(wallet.ledger()).toEqual([]);
    });

    it('rejects an invalid amount before looking at the recipient', async () => {
      const { service, wallet } = createTestWallet();

      await expect(service.transfer({ fromUserId: 1, toUsername: 'bob', amount: 0.001 })).rejects.toThrow(
        ValidationError,
      );
      expect(wallet.balanceOf(2)).toBe(0);
    });

    it('rejects a sender that no longer exists', async () => {
      const { service } = createTestWallet();

      await expect(service.transfer({ fromUserId: 999, toUsername: 'bob', amount: 1 })).rejects.toThrow(
        UnauthorizedError,
      );
    });

    it('keeps cents exact over repeated transfers', async () => {
      const { service, wallet } = createTestWallet();
      await service.topup({ userId: 1, amount: 0.3 });

      await service.transfer({ fromUserId: 1, toUsername: 'bob', amount: 0.1 });
      await service.transfer({ fromUserId: 1, toUsername: 'bob', amount: 0.1 });

      expect(wallet.balanceOf(1)).toBe(100.1);
      expect(wallet.balanceOf(2)).toBe(0.2);
    });
  });
});
