import { get } from './client';
import type { BalanceResponse, TopTransaction, TopUser, TransactionPage, TransactionQuery } from './types';

/**
 * Wallet and reporting calls, one function per endpoint the dashboard uses.
 *
 * Feature modules never build URLs by hand, so a change to the API (a new filter, a renamed
 * parameter) is a change in this file only.
 */

/** GET /balance */
export async function fetchBalance(): Promise<number> {
  const { balance } = await get<BalanceResponse>('/balance');
  return balance;
}

/**
 * GET /transactions/top — the largest transactions by value, debits negative.
 * @param limit 1..50 (the API caps it)
 */
export function fetchTopTransactions(limit = 10): Promise<TopTransaction[]> {
  return get<TopTransaction[]>('/transactions/top', { limit });
}

/**
 * GET /users/top — users ranked by the total value they transacted.
 * @param limit 1..50 (the API caps it)
 */
export function fetchTopUsers(limit = 10): Promise<TopUser[]> {
  return get<TopUser[]>('/users/top', { limit });
}

/**
 * Drop empty filter values: the API treats them as "no filter", and sending `?direction=` is just
 * noise in logs and cache keys.
 */
function toQueryParams(query: TransactionQuery): Record<string, string | number> {
  const params: Record<string, string | number> = { page: query.page, per_page: query.per_page };
  for (const [key, value] of Object.entries(query)) {
    if (key === 'page' || key === 'per_page') continue;
    if (typeof value === 'string' && value.trim() !== '') {
      params[key] = value.trim();
    } else if (typeof value === 'number') {
      params[key] = value;
    }
  }
  return params;
}

/** GET /transactions — one page of a ledger, with filters and summary totals. */
export function fetchTransactions(query: TransactionQuery): Promise<TransactionPage> {
  return get<TransactionPage>('/transactions', toQueryParams(query));
}
