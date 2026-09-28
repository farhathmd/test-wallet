import { toAmount } from '../../domain/money.js';
import { toIsoTimestamp } from './timestamp.js';

/**
 * Outbound transaction representations.
 *
 * Field names here are the API contract (snake_case where the specification says so, e.g.
 * `transacted_value`), which is why the mapping lives in the serializers and not in the services.
 */

/**
 * GET /transactions/top → array of { username, amount }, debits negative.
 * @param {Array<{ username: string, amount: number }>} rows
 */
export function serializeTopTransactions(rows) {
  return rows.map((row) => ({ username: row.username, amount: toAmount(row.amount) }));
}

/**
 * GET /users/top → array of { username, transacted_value }.
 * @param {Array<{ username: string, transactedValue: number }>} rows
 */
export function serializeTopUsers(rows) {
  return rows.map((row) => ({
    username: row.username,
    transacted_value: toAmount(row.transactedValue),
  }));
}

/**
 * GET /transactions → page of ledger entries plus paging metadata and summary totals.
 * @param {{ data: object[], meta: object }} result
 */
export function serializeTransactionPage(result) {
  const { meta } = result;
  return {
    data: result.data.map((row) => ({
      id: row.id,
      type: row.type,
      direction: row.direction,
      counterparty: row.counterparty,
      amount: toAmount(row.amount),
      created_at: toIsoTimestamp(row.createdAt),
    })),
    page: meta.page,
    per_page: meta.perPage,
    total: meta.total,
    total_pages: meta.totalPages,
    summary: {
      credit_total: toAmount(meta.summary.creditTotal),
      debit_total: toAmount(meta.summary.debitTotal),
      net: toAmount(meta.summary.net),
    },
  };
}
