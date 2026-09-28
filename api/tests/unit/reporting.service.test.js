import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenError, NotFoundError } from '../../src/domain/errors.js';
import { createReportingService } from '../../src/services/reporting.service.js';
import { createFakeReportingRepository } from '../helpers/fake-repositories.js';

const alice = { id: 1, username: 'alice', role: 'user' };
const admin = { id: 3, username: 'admin', role: 'admin' };

/** Only counts as a user directory: the reporting service must not go looking for anyone else. */
const userRepository = {
  async findByUsername(username) {
    return username === 'bob' ? { id: 2, username: 'bob' } : null;
  },
};

function createService(options) {
  const repository = createFakeReportingRepository(options);
  return { service: createReportingService({ transactionRepository: repository, userRepository }), repository };
}

describe('services/reporting.service', () => {
  describe('getTopTransactions', () => {
    it('maps rows to { username, amount } keeping debits negative', async () => {
      const { service } = createService({
        topTransactions: [
          { counterparty: 'bob', amount: -80 },
          { counterparty: 'carol', amount: 25.5 },
        ],
      });

      const rows = await service.getTopTransactions({ userId: 1 });

      assert.deepEqual(rows, [
        { username: 'bob', amount: -80 },
        { username: 'carol', amount: 25.5 },
      ]);
    });

    it('defaults to the documented top 10 and passes the limit through', async () => {
      const { service, repository } = createService();

      await service.getTopTransactions({ userId: 1 });
      await service.getTopTransactions({ userId: 1, limit: 3 });

      assert.deepEqual(repository.calls.top, [
        { userId: 1, limit: 10 },
        { userId: 1, limit: 3 },
      ]);
    });

    it('returns an empty list for a user without transactions', async () => {
      const { service } = createService({ topTransactions: [] });

      assert.deepEqual(await service.getTopTransactions({ userId: 1 }), []);
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

      assert.deepEqual(await service.getTopUsers({}), [
        { username: 'bob', transactedValue: 1234.57 },
        { username: 'carol', transactedValue: 10 },
      ]);
    });
  });

  describe('getTransactionPage', () => {
    const pageRows = [
      {
        id: 9,
        type: 'transfer',
        direction: 'debit',
        counterparty: 'bob',
        amount: 12.5,
        createdAt: '2026-02-01T10:00:00.000Z',
      },
    ];

    it('returns the page, paging metadata and rounded credit/debit totals', async () => {
      const { service, repository } = createService({
        page: pageRows,
        total: 23,
        summary: { creditTotal: 100.5, debitTotal: 40.25 },
      });

      const result = await service.getTransactionPage({
        requester: alice,
        page: 2,
        perPage: 10,
      });

      assert.deepEqual(result.data, pageRows);
      assert.deepEqual(result.meta, {
        page: 2,
        perPage: 10,
        total: 23,
        totalPages: 3,
        summary: { creditTotal: 100.5, debitTotal: 40.25, net: 60.25 },
      });
      // Paging is translated into a single LIMIT/OFFSET: no query per row, no query per page.
      assert.deepEqual(repository.calls.page, [
        { userId: 1, filters: {}, limit: 10, offset: 10 },
      ]);
      assert.deepEqual(repository.calls.count, [{ userId: 1, filters: {} }]);
    });

    it('always advertises at least one page, even when there are no rows', async () => {
      const { service } = createService({ page: [], total: 0 });

      const result = await service.getTransactionPage({ requester: alice, page: 1, perPage: 10 });

      assert.deepEqual(result.data, []);
      assert.equal(result.meta.totalPages, 1);
      assert.equal(result.meta.total, 0);
    });

    it('forwards filters unchanged to every read', async () => {
      const filters = { type: 'transfer', direction: 'debit', q: 'bo', from: '2026-01-01T00:00:00.000Z' };
      const { service, repository } = createService({ total: 1 });

      await service.getTransactionPage({ requester: alice, page: 1, perPage: 5, filters });

      assert.deepEqual(repository.calls.page[0].filters, filters);
      assert.deepEqual(repository.calls.count[0].filters, filters);
      assert.deepEqual(repository.calls.summary[0].filters, filters);
    });

    it('answers own ledger requests without needing the admin role', async () => {
      const { service, repository } = createService({ total: 0 });

      await service.getTransactionPage({
        requester: alice,
        targetUsername: 'ALICE',
        page: 1,
        perPage: 10,
      });

      // Own username (any casing) resolves to the requester's own wallet, no admin check involved.
      assert.equal(repository.calls.page[0].userId, 1);
    });

    it('lets an admin look at another wallet', async () => {
      const { service, repository } = createService({ total: 0 });

      await service.getTransactionPage({ requester: admin, targetUsername: 'bob', page: 1, perPage: 10 });

      // bob's id (2), not the admin's (3)
      assert.equal(repository.calls.page[0].userId, 2);
    });

    it('refuses another wallet for a normal user', async () => {
      const { service } = createService();

      await assert.rejects(
        () => service.getTransactionPage({ requester: alice, targetUsername: 'bob', page: 1, perPage: 10 }),
        ForbiddenError,
      );
    });

    it('reports an unknown wallet for an admin as a not found', async () => {
      const { service } = createService();

      await assert.rejects(
        () => service.getTransactionPage({ requester: admin, targetUsername: 'ghost', page: 1, perPage: 10 }),
        NotFoundError,
      );
    });

    it('issues the three independent reads concurrently', async () => {
      const started = [];
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const service = createReportingService({
        userRepository,
        transactionRepository: {
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
            return gate.then(() => ({ creditTotal: 0, debitTotal: 0 }));
          },
        },
      });

      const pending = service.getTransactionPage({ requester: alice, page: 1, perPage: 10 });
      // If the reads were sequential, only the first would have started while it is still pending.
      await new Promise((resolve) => setImmediate(resolve));
      assert.deepEqual(started.sort(), ['count', 'page', 'summary']);

      release();
      await pending;
    });
  });
});
