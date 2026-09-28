import type { TransactionType } from '../../domain/ledger';
import { moneyToNumber, Money } from '../../domain/money';
import { toIsoTimestamp } from './timestamp';

/**
 * Outgoing ledger payloads.
 *
 * The internal view models are camelCase and keep money as `Decimal`; the documented wire format is
 * snake_case with plain numbers. This is the only place where that translation happens.
 */
export interface SerializedTopTransaction {
  username: string;
  /** Negative for money leaving the wallet. */
  amount: number;
}

export interface SerializedTopUser {
  username: string;
  transacted_value: number;
}

export interface SerializedTransactionRow {
  id: number;
  type: TransactionType;
  direction: 'credit' | 'debit';
  counterparty: string | null;
  amount: number;
  created_at: string;
}

export interface SerializedTransactionPage {
  data: SerializedTransactionRow[];
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
  summary: { credit_total: number; debit_total: number; net: number };
}

export function serializeTopTransaction(row: { username: string; amount: Money | number }): SerializedTopTransaction {
  return { username: row.username, amount: moneyToNumber(row.amount) };
}

export function serializeTopUser(row: { username: string; transactedValue: Money | number }): SerializedTopUser {
  return { username: row.username, transacted_value: moneyToNumber(row.transactedValue) };
}

export function serializeTransactionRow(row: {
  id: number;
  type: TransactionType;
  direction: 'credit' | 'debit';
  counterparty: string | null;
  amount: Money | number;
  createdAt: Date | string;
}): SerializedTransactionRow {
  return {
    id: row.id,
    type: row.type,
    direction: row.direction,
    counterparty: row.counterparty,
    amount: moneyToNumber(row.amount),
    created_at: toIsoTimestamp(row.createdAt),
  };
}

export function serializeTransactionPage(page: {
  data: Parameters<typeof serializeTransactionRow>[0][];
  meta: { page: number; perPage: number; total: number; totalPages: number };
  summary: { creditTotal: Money | number; debitTotal: Money | number; net: Money | number };
}): SerializedTransactionPage {
  return {
    data: page.data.map(serializeTransactionRow),
    page: page.meta.page,
    per_page: page.meta.perPage,
    total: page.meta.total,
    total_pages: page.meta.totalPages,
    summary: {
      credit_total: moneyToNumber(page.summary.creditTotal),
      debit_total: moneyToNumber(page.summary.debitTotal),
      net: moneyToNumber(page.summary.net),
    },
  };
}
