import { useCallback } from 'react';
import { fetchBalance, fetchTopTransactions, fetchTopUsers, fetchTransactions } from '../api/wallet.api';
import type { TopTransaction, TopUser, TransactionPage, TransactionQuery } from '../api/types';
import { useApiResource, type Resource } from './useApiResource';

/**
 * Data hooks: one per screen concern, each a thin wrapper around `useApiResource` plus the matching
 * API function. Components stay declarative — they render `data`, `loading` and `error`.
 */

export interface DashboardSummary {
  balance: number;
  topTransactions: TopTransaction[];
  topUsers: TopUser[];
}

/**
 * Everything the dashboard header and charts need, fetched concurrently.
 *
 * The three requests are independent, so `Promise.all` issues them together instead of stringing them
 * one after another — the dashboard appears in one round trip rather than three.
 */
export function useDashboardSummary(): Resource<DashboardSummary> {
  const loader = useCallback(async (): Promise<DashboardSummary> => {
    const [balance, topTransactions, topUsers] = await Promise.all([
      fetchBalance(),
      fetchTopTransactions(10),
      fetchTopUsers(10),
    ]);
    return { balance, topTransactions, topUsers };
  }, []);

  return useApiResource(loader, []);
}

/**
 * The usernames the transfer form offers as recipient suggestions.
 *
 * There is no "list all users" endpoint, and the dashboard does not need one: `GET /users/top` already
 * returns usernames, so the suggestions cost one request and no API change. Typing a name that is not
 * in the list still works — this is a hint, not a whitelist.
 */
export function useTopUsernames(): string[] {
  const loader = useCallback(() => fetchTopUsers(50), []);
  const resource = useApiResource(loader, []);
  return resource.data?.map((row) => row.username) ?? [];
}

/**
 * One page of the ledger for the current filters. The query object is serialised into the dependency
 * list, so changing a filter, the search term or the page triggers exactly one refetch.
 */
export function useTransactions(query: TransactionQuery): Resource<TransactionPage> {
  const key = JSON.stringify(query);
  const loader = useCallback(() => {
    const parsed = JSON.parse(key) as TransactionQuery;
    return fetchTransactions(parsed);
  }, [key]);

  return useApiResource(loader, [key]);
}
