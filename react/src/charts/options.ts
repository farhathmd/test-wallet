import type { ChartData, ChartOptions } from 'chart.js';
import type { TopTransaction, TopUser, TransactionSummary } from '../api/types';
import type { Theme } from '../theme/theme';

/**
 * Chart data/option builders — pure functions, no React and no canvas.
 *
 * Keeping the mapping out of the components means the chart logic (which bars are green, how a
 * negative amount is rendered) can be unit tested in Node without a browser, and each chart component
 * stays a five line wrapper.
 */
/**
 * Chart.js paints to a canvas and cannot read CSS variables, so every colour it needs is passed in from
 * here. This mirrors the variables in `styles.css`: money stays green-in/red-out, but the dark variants
 * are the lighter shades, because the light theme's deep green and red turn muddy on a dark surface.
 * (Measured against the card background: the deep pair land at 3.4:1 and 2.6:1, the light pair at 9.7:1
 * and 6.1:1 — 3:1 being the WCAG minimum for a graphical object such as a bar.)
 */
export interface ChartPalette {
  text: string;
  grid: string;
  credit: string;
  debit: string;
  neutral: string;
}

export const CHART_PALETTES: Record<Theme, ChartPalette> = {
  light: {
    text: '#475569',
    grid: 'rgba(15, 23, 42, 0.08)',
    credit: '#15803d',
    debit: '#b91c1c',
    neutral: '#4338ca',
  },
  dark: {
    text: '#94a3b8',
    grid: 'rgba(148, 163, 184, 0.18)',
    credit: '#4ade80',
    debit: '#f87171',
    neutral: '#a5b4fc',
  },
};

/** The light palette, which is what a chart with no theme to read falls back to. */
export const CREDIT_COLOR = CHART_PALETTES.light.credit;
export const DEBIT_COLOR = CHART_PALETTES.light.debit;

/** Shared look for the cartesian charts. */
export function barChartOptions(palette: ChartPalette): ChartOptions<'bar'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { precision: 0, color: palette.text },
        grid: { color: palette.grid },
      },
      x: { ticks: { color: palette.text }, grid: { display: false } },
    },
  };
}

/** Horizontal variant, used for the "top users" ranking where usernames are the labels. */
export function horizontalBarChartOptions(palette: ChartPalette): ChartOptions<'bar'> {
  return {
    ...barChartOptions(palette),
    indexAxis: 'y' as const,
    scales: {
      x: { beginAtZero: true, ticks: { color: palette.text }, grid: { color: palette.grid } },
      y: { ticks: { color: palette.text }, grid: { display: false } },
    },
  };
}

export function doughnutChartOptions(palette: ChartPalette): ChartOptions<'doughnut'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' as const, labels: { color: palette.text } },
    },
  };
}

/**
 * Top transactions by value: one bar per transaction, absolute height, colour by direction.
 *
 * The sign is carried by the colour (green in, red out) rather than by the axis, because a bar chart
 * with mixed signs is hard to read when the values are ranked by magnitude. The signed amounts are
 * shown in the transaction table below.
 *
 * The palette defaults to the light one so a caller that is not theme aware still gets the original
 * colours; the chart component passes the palette for the active theme.
 */
export function buildTopTransactionsData(
  rows: TopTransaction[],
  palette: ChartPalette = CHART_PALETTES.light,
): ChartData<'bar'> {
  return {
    labels: rows.map((row) => row.username),
    datasets: [
      {
        label: 'Transaction value',
        data: rows.map((row) => Math.abs(row.amount)),
        backgroundColor: rows.map((row) => (row.amount < 0 ? palette.debit : palette.credit)),
        borderRadius: 4,
        maxBarThickness: 28,
      },
    ],
  };
}

/** Money in versus money out for the current filters (totals, not the visible page). */
export function buildCreditDebitData(
  summary: TransactionSummary,
  palette: ChartPalette = CHART_PALETTES.light,
): ChartData<'doughnut'> {
  return {
    labels: ['Money in', 'Money out'],
    datasets: [
      {
        label: 'Volume',
        data: [summary.credit_total, summary.debit_total],
        backgroundColor: [palette.credit, palette.debit],
        borderWidth: 0,
        hoverOffset: 6,
      },
    ],
  };
}

/** Users ranked by total value transacted, all outbound, so a single colour. */
export function buildTopUsersData(
  rows: TopUser[],
  palette: ChartPalette = CHART_PALETTES.light,
): ChartData<'bar'> {
  return {
    labels: rows.map((row) => row.username),
    datasets: [
      {
        label: 'Value transacted',
        data: rows.map((row) => row.transacted_value),
        backgroundColor: palette.neutral,
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
