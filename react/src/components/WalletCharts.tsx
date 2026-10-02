import { Bar, Doughnut } from 'react-chartjs-2';
import type { TopTransaction, TopUser, TransactionSummary } from '../api/types';
import {
  CHART_PALETTES,
  barChartOptions,
  buildCreditDebitData,
  buildTopTransactionsData,
  buildTopUsersData,
  doughnutChartOptions,
  horizontalBarChartOptions,
  type ChartPalette,
} from '../charts/options';
import { registerCharts } from '../charts/register';
import { useTheme } from '../context/ThemeContext';
import { ChartCard } from './ChartCard';

/**
 * The three dashboard charts.
 *
 * Each component is: register the Chart.js parts once, map data through a pure builder, render. All the
 * interesting logic (colours, signs, axes) lives in src/charts/options.ts where it is unit tested
 * without a canvas. The palette is the one input that comes from React, because a canvas cannot read a
 * CSS variable — it goes into both the data builders (bar colours) and the options (labels, gridlines).
 */
registerCharts();

/** The chart colours for the current theme. */
function useChartPalette(): ChartPalette {
  const { theme } = useTheme();
  return CHART_PALETTES[theme];
}

export function TopTransactionsChart({ rows }: { rows: TopTransaction[] }) {
  const palette = useChartPalette();
  return (
    <ChartCard
      title="Top transactions by value"
      caption="The 10 largest transactions on this wallet. Green is money in, red is money out; the bars are ranked by amount."
      isEmpty={rows.length === 0}
      emptyMessage="This wallet has no transfers yet."
    >
      <Bar data={buildTopTransactionsData(rows, palette)} options={barChartOptions(palette)} />
    </ChartCard>
  );
}

export function CreditDebitChart({ summary }: { summary: TransactionSummary }) {
  const palette = useChartPalette();
  const hasVolume = summary.credit_total > 0 || summary.debit_total > 0;
  return (
    <ChartCard
      title="Money in vs money out"
      caption="Totals for every transaction matching the current filters, not just the visible page."
      isEmpty={!hasVolume}
      emptyMessage="No money moved for the current filters."
    >
      <Doughnut data={buildCreditDebitData(summary, palette)} options={doughnutChartOptions(palette)} />
    </ChartCard>
  );
}

export function TopUsersChart({ rows }: { rows: TopUser[] }) {
  const palette = useChartPalette();
  return (
    <ChartCard
      title="Top users by value transacted"
      caption="Across all wallets: total value each user has sent out."
      isEmpty={rows.length === 0}
      emptyMessage="No transfers have been made yet."
    >
      <Bar data={buildTopUsersData(rows, palette)} options={horizontalBarChartOptions(palette)} />
    </ChartCard>
  );
}
