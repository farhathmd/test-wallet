import type { ChartData, ChartOptions } from 'chart.js';
import type { TopTransaction, TopUser, TransactionSummary } from '../api/types';

/**
 * Chart data/option builders — pure functions, no React and no canvas.
 *
 * Keeping the mapping out of the components means the chart logic (which bars are green, how a
 * negative amount is rendered) can be unit tested in Node without a browser, and each chart component
 * stays a five line wrapper.
 */
export const CREDIT_COLOR = '#15803d';
export const DEBIT_COLOR = '#b91c1c';
const NEUTRAL_COLOR = '#4338ca';

/** Shared look for the cartesian charts. */
export const barChartOptions: ChartOptions<'bar'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
  },
  scales: {
    y: { beginAtZero: true, ticks: { precision: 0 } },
    x: { grid: { display: false } },
  },
};

/** Horizontal variant, used for the "top users" ranking where usernames are the labels. */
export const horizontalBarChartOptions: ChartOptions<'bar'> = {
  ...barChartOptions,
  indexAxis: 'y' as const,
  scales: {
    x: { beginAtZero: true },
    y: { grid: { display: false } },
  },
};

export const doughnutChartOptions: ChartOptions<'doughnut'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom' as const },
  },
};

/**
 * Top transactions by value: one bar per transaction, absolute height, colour by direction.
 *
 * The sign is carried by the colour (green in, red out) rather than by the axis, because a bar chart
 * with mixed signs is hard to read when the values are ranked by magnitude. The signed amounts are
 * shown in the transaction table below.
 */
export function buildTopTransactionsData(rows: TopTransaction[]): ChartData<'bar'> {
  return {
    labels: rows.map((row) => row.username),
    datasets: [
      {
        label: 'Transaction value',
        data: rows.map((row) => Math.abs(row.amount)),
        backgroundColor: rows.map((row) => (row.amount < 0 ? DEBIT_COLOR : CREDIT_COLOR)),
        borderRadius: 4,
        maxBarThickness: 28,
      },
    ],
  };
}

/** Money in versus money out for the current filters (totals, not the visible page). */
export function buildCreditDebitData(summary: TransactionSummary): ChartData<'doughnut'> {
  return {
    labels: ['Money in', 'Money out'],
    datasets: [
      {
        label: 'Volume',
        data: [summary.credit_total, summary.debit_total],
        backgroundColor: [CREDIT_COLOR, DEBIT_COLOR],
        borderWidth: 0,
        hoverOffset: 6,
      },
    ],
  };
}

/** Users ranked by total value transacted, all outbound, so a single colour. */
export function buildTopUsersData(rows: TopUser[]): ChartData<'bar'> {
  return {
    labels: rows.map((row) => row.username),
    datasets: [
      {
        label: 'Value transacted',
        data: rows.map((row) => row.transacted_value),
        backgroundColor: NEUTRAL_COLOR,
        borderRadius: 4,
        maxBarThickness: 24,
      },
    ],
  };
}

/** True when a chart has nothing meaningful to draw (all zeroes or no rows). */
export function isEmptyChartData(rows: unknown[]): boolean {
  return rows.length === 0;
}
