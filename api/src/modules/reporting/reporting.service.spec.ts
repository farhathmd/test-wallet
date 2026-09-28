import { ForbiddenError, NotFoundError } from '../../domain/errors';
import type { TransactionRepository } from '../../repositories/transaction.repository';
import type { UserRepository } from '../../repositories/user.repository';
import { createFakeReportingRepository, FakeReportingOptions } from '../../testing/fake-repositories';
import { ReportingService } from './reporting.service';

const alice = { id: 1, username: 'alice', role: 'user' } as const;
const admin = { id: 3, username: 'admin', role: 'admin' } as const;

/** Only counts as a user directory: the service must not go looking for anyone else. */
const userRepository = {
  async findByUsername(username: string) {
    return username === 'bob' ? { id: 2, username: 'bob' } : null;
  },
};

function createService(options: FakeReportingOptions = {}) {
  const repository = createFakeReportingRepository(options);
  const service = new ReportingService(
    userRepository as unknown as UserRepository,
    repository as unknown as TransactionRepository,
  );
  return { service, repository };
}

describe('modules/reporting/reporting.service', () => {
  describe('getTopTransactions', () => {
    it('maps rows to { username, amount }, keeping debits negative', async () => {
      const { service } = createService({
        topTransactions: [
          { counterparty: 'bob', amount: -80 },
          { counterparty: 'carol', amount: 25.5 },
        ],
      });

      const rows = await service.getTopTransactions({ userId: 1 });

      expect(rows).toEqual([
        { username: 'bob', amount: -80 },
        { username: 'carol', amount: 25.5 },
      ]);
    });

    it('defaults to the documented top 10 and passes an explicit limit through', async () => {
      const { service, repository } = createService();

      await service.getTopTransactions({ userId: 1 });
      await service.getTopTransactions({ userId: 1, limit: 3 });

      expect(repository.calls.top).toEqual([
        { userId: 1, limit: 10 },
        { userId: 1, limit: 3 },
      ]);
    });

    it('returns an empty list for a user without transactions', async () => {
      const { service } = createService({ topTransactions: [] });

      await expect(service.getTopTransactions({ userId: 1 })).resolves.toEqual([]);
    });
  });

  describe('getTopUsers', () => {
    it('maps transactedValue to the documented field and rounds to cents', async () => {
      const { service } = createService({
        topUsers: [
          { username: 'bob', transactedValue: 1234.567 },
          { username: 'carol', transactedValue: 10 },
        ],
      });

      await expect(service.getTopUsers({})).resolves.toEqual([
        { username: 'bob', transactedValue: 1234.57 },
        { username: 'carol', transactedValue: 10 },
      ]);
    });
  });

  describe('getTransactionPage', () => {
    const pageRows = [
      {
        id: 9,
        type: 'transfer' as const,
        direction: 'debit' as const,
        counterparty: 'bob',
        amount: 12.5,
        createdAt: new Date('2026-02-01T10:00:00.000Z'),
      },
    ];

    it('returns the page, its paging metadata and the rounded totals of the whole filtered set', async () => {
      const { service, repository } = createService({
        page: pageRows,
        total: 23,
        summary: { creditTotal: 100.5, debitTotal: 40.25 },
      });

      const result = await service.getTransactionPage({ requester: alice, page: 2, perPage: 10 });

      expect(result.data).toEqual(pageRows);
      expect(result.meta).toEqual({ page: 2, perPage: 10, total: 23, totalPages: 3 });
      expect(result.summary).toEqual({ creditTotal: 100.5, debitTotal: 40.25, net: 60.25 });
      expect(repository.calls.page[0]).toMatchObject({ userId: 1, page: 2, perPage: 10 });
    });

    it('reports a single page, even when there are no rows', async () => {
      const { service } = createService({ page: [], total: 0 });

      const result = await service.getTransactionPage({ requester: alice, page: 1, perPage: 10 });

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
      expect(result.meta.totalPages).toBe(1);
    });

    it('forwards the filters unchanged to every read', async () => {
      const filters = {
        type: 'transfer' as const,
        direction: 'debit' as const,
        q: 'bo',
        from: new Date('2026-01-01T00:00:00.000Z'),
      };
      const { service, repository } = createService({ total: 1 });

      await service.getTransactionPage({ requester: alice, page: 1, perPage: 5, filters });

      expect(repository.calls.page[0]).toMatchObject({ filters });
      expect(repository.calls.count[0]).toMatchObject({ filters });
      expect(repository.calls.summary[0]).toMatchObject({ filters });
    });

    it('answers an own-ledger request in any casing without needing the admin role', async () => {
      const { service, repository } = createService({ total: 0 });

      await service.getTransactionPage({
        requester: alice,
        targetUsername: 'ALICE',
        page: 1,
        perPage: 10,
      });

      expect(repository.calls.page[0]).toMatchObject({ userId: 1 });
    });

    it('lets an admin look at another wallet', async () => {
      const { service, repository } = createService({ total: 0 });

      await service.getTransactionPage({
        requester: admin,
        targetUsername: 'bob',
        page: 1,
        perPage: 10,
      });

      // bob's id (2), not the admin's (3)
      expect(repository.calls.page[0]).toMatchObject({ userId: 2 });
    });

    it('refuses another wallet for a normal user, without looking it up', async () => {
      const { service, repository } = createService();

      await expect(
        service.getTransactionPage({ requester: alice, targetUsername: 'bob', page: 1, perPage: 10 }),
      ).rejects.toThrow(ForbiddenError);
      expect(repository.calls.page).toEqual([]);
    });

    it('reports an unknown wallet for an admin as a not found', async () => {
      const { service } = createService();

      await expect(
        service.getTransactionPage({ requester: admin, targetUsername: 'ghost', page: 1, perPage: 10 }),
      ).rejects.toThrow(NotFoundError);
    });

    it('issues the three independent reads concurrently, not one after another', async () => {
      const started: string[] = [];
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const repository = {
        async findPageForUser() {
          started.push('page');
          return gate.then(() => []);
        },
        async countForUser() {
          started.push('count');
          return gate.then(() => 0);
        },
        async summariseForUser() {
          started.push('summary');
          return gate.then(() => ({ creditTotal: 0, debitTotal: 0, net: 0 }));
        },
      };
      const service = new ReportingService(
        userRepository as unknown as UserRepository,
        repository as unknown as TransactionRepository,
      );

      const pending = service.getTransactionPage({ requester: alice, page: 1, perPage: 10 });
      // If the reads were sequential, only the first would have started while the response is pending.
      await new Promise((resolve) => setImmediate(resolve));
      expect(started.sort()).toEqual(['count', 'page', 'summary']);

      release();
      await pending;
    });
  });
});
