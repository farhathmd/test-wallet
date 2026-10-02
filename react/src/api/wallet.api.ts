import { get, post } from './client';
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

/**
 * Parse an amount typed into a form into the JSON number the API expects.
 *
 * The API's DTO forwards the amount to the wallet service, which rejects anything that is not a finite
 * number (`"amount" must be a finite number.`) — but a *string* such as `"250.00"` fails that same
 * check, and a typo like `1,50` serialises to `null` and comes back as `"amount" is required.`, which
 * describes the wrong problem. So the conversion happens here, once, at the trust boundary: a value
 * the browser cannot read as a number is answered in the browser.
 *
 * Precision: `Number('25.50')` is 25.5 and `Number('9999999.99')` round-trips through JSON as the same
 * decimal, so the value that arrives is the value that was typed. The money rules themselves (more
 * than 0, less than 10,000,000, at most two decimals) stay in the API and are not duplicated here.
 */
export function toAmount(value: string): number {
  const trimmed = value.trim();
  // A blank field is checked first on purpose: Number('') is 0, and a silent zero would look like a
  // deliberate amount rather than a missing one.
  if (trimmed === '') {
    throw new Error('Enter an amount.');
  }
  const amount = Number(trimmed);
  if (!Number.isFinite(amount)) {
    throw new Error(`“${trimmed}” is not a number. Use digits and a dot, for example 250.00.`);
  }
  return amount;
}

/**
 * POST /topup — adds funds to the caller's own wallet (the API takes no target: the token decides
 * whose wallet it is).
 *
 * The API answers 204, so there is nothing to return — read the balance back with `fetchBalance`.
 */
export function topup(amount: string): Promise<void> {
  return post<void>('/topup', { amount: toAmount(amount) });
}

/**
 * POST /transfer — moves funds from the caller's own wallet to `toUsername`.
 *
 * The field is `to_username` because that is the API's contract (see api/README.md); 204 on success, so
 * the balance is fetched separately.
 */
export function transfer(toUsername: string, amount: string): Promise<void> {
  return post<void>('/transfer', { to_username: toUsername, amount: toAmount(amount) });
}
