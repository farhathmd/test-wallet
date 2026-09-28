import { useState } from 'react';
import { EmptyState, ErrorBanner, LoadingBlock } from '../components/Feedback';
import { Pagination } from '../components/Pagination';
import { StatCard } from '../components/StatCard';
import { TransactionFilters } from '../components/TransactionFilters';
import { TransactionTable } from '../components/TransactionTable';
import { CreditDebitChart, TopTransactionsChart, TopUsersChart } from '../components/WalletCharts';
import { useAuth } from '../context/AuthContext';
import { useDashboardSummary, useTransactions } from '../hooks/useWalletData';
import type { TransactionQuery } from '../api/types';
import { formatAmount } from '../utils/format';

const INITIAL_QUERY: TransactionQuery = { page: 1, per_page: 10 };

/**
 * The dashboard.
 *
 * Two independent data sources drive it:
 *   * the wallet summary (balance + the two rankings) for the header cards and charts, and
 *   * the filtered, paginated ledger for the table and the "money in / money out" cards.
 *
 * Keeping them separate means changing a filter only refetches the table, and the charts stay put.
 */
export function DashboardPage() {
  const { user } = useAuth();
  const [query, setQuery] = useState<TransactionQuery>(INITIAL_QUERY);

  const summary = useDashboardSummary();
  const transactions = useTransactions(query);

  const summaryError = summary.error;
  const transactionsError = transactions.error;
  const isAdmin = user?.role === 'admin';
  const summaryTotals = transactions.data?.summary;
  const hasRows = (transactions.data?.data.length ?? 0) > 0;

  return (
    <>
      <section className="dashboard__intro">
        <h1>Wallet overview</h1>
        <p>
          Signed in as <strong>{user?.username}</strong>. Charts and totals summarise your own wallet;
          use the filters below to search the ledger.
        </p>
      </section>

      <section className="stat-grid" aria-label="Wallet summary">
        <StatCard
          label="Current balance"
          value={summary.data?.balance ?? 0}
          hint={summary.error ? 'Unavailable' : 'GET /balance'}
        />
        <StatCard
          label="Money in"
          value={summaryTotals?.credit_total ?? 0}
          tone="credit"
          hint="Filtered transactions"
        />
        <StatCard
          label="Money out"
          value={summaryTotals?.debit_total ?? 0}
          tone="debit"
          hint="Filtered transactions"
        />
        <StatCard
          label="Net movement"
          value={formatAmount(summaryTotals?.net ?? 0, { withSign: true })}
          hint={`${transactions.data?.total ?? 0} transaction(s) matched`}
        />
      </section>

      {summaryError ? (
        <ErrorBanner error={summaryError} onRetry={summary.reload} />
      ) : (
        <section className="chart-grid" aria-label="Charts">
          {summary.loading && !summary.data ? (
            <LoadingBlock label="Loading charts…" />
          ) : (
            <>
              <TopTransactionsChart rows={summary.data?.topTransactions ?? []} />
              <CreditDebitChart
                summary={
                  summaryTotals ?? { credit_total: 0, debit_total: 0, net: 0 }
                }
              />
              <TopUsersChart rows={summary.data?.topUsers ?? []} />
            </>
          )}
        </section>
      )}

      <section className="card" aria-label="Transactions">
        <header className="card__header">
          <h2>Transactions</h2>
          <p>
            Newest first. {isAdmin ? 'As an admin you can inspect any wallet by username. ' : ''}
            Amounts are signed: <span className="amount--credit">money in</span> and{' '}
            <span className="amount--debit">money out</span>.
          </p>
        </header>

        <TransactionFilters
          query={query}
          isAdmin={isAdmin}
          disabled={transactions.loading}
          onChange={setQuery}
        />

        {transactionsError ? (
          <ErrorBanner error={transactionsError} onRetry={transactions.reload} />
        ) : transactions.loading && !transactions.data ? (
          <LoadingBlock label="Loading transactions…" />
        ) : hasRows ? (
          <>
            <TransactionTable rows={transactions.data?.data ?? []} />
            <Pagination
              page={transactions.data?.page ?? query.page}
              perPage={transactions.data?.per_page ?? query.per_page}
              total={transactions.data?.total ?? 0}
              totalPages={transactions.data?.total_pages ?? 1}
              onPageChange={(page) => setQuery((current) => ({ ...current, page }))}
              disabled={transactions.loading}
            />
          </>
        ) : (
          <EmptyState>No transactions match these filters.</EmptyState>
        )}
      </section>
    </>
  );
}
