import { describe, expect, it } from 'vitest';
import type { TopTransaction, TopUser, TransactionSummary } from '../api/types';
import {
  DEBIT_COLOR,
  CREDIT_COLOR,
  buildCreditDebitData,
  buildTopTransactionsData,
  buildTopUsersData,
} from '../charts/options';
import { counterpartyLabel, formatAmount, formatDateTime, pageDescription } from '../utils/format';

/**
 * The chart builders and formatters are pure, so they are covered here rather than through the
 * components: the tests read exactly like the rules they protect.
 */
describe('chart builders', () => {
  it('ranks top transactions by absolute value and colours the direction', () => {
    const rows: TopTransaction[] = [
      { username: 'bob', amount: -200.25 },
      { username: 'carol', amount: 50 },
    ];

    const data = buildTopTransactionsData(rows);

    expect(data.labels).toEqual(['bob', 'carol']);
    expect(data.datasets[0].data).toEqual([200.25, 50]);
    expect(data.datasets[0].backgroundColor).toEqual([DEBIT_COLOR, CREDIT_COLOR]);
  });

  it('handles an empty ranking without inventing a dataset entry', () => {
    const data = buildTopTransactionsData([]);

    expect(data.labels).toEqual([]);
    expect(data.datasets[0].data).toEqual([]);
  });

  it('maps the summary totals into money in / money out', () => {
    const summary: TransactionSummary = { credit_total: 700, debit_total: 150, net: 550 };

    const data = buildCreditDebitData(summary);

    expect(data.labels).toEqual(['Money in', 'Money out']);
    expect(data.datasets[0].data).toEqual([700, 150]);
  });

  it('maps top users straight onto their bars', () => {
    const rows: TopUser[] = [
      { username: 'bob', transacted_value: 225.5 },
      { username: 'alice', transacted_value: 150 },
    ];

    const data = buildTopUsersData(rows);

    expect(data.labels).toEqual(['bob', 'alice']);
    expect(data.datasets[0].data).toEqual([225.5, 150]);
  });
});

describe('formatting helpers', () => {
  it('formats money with two decimals and a visible sign', () => {
    expect(formatAmount(1234.5)).toBe('$1,234.50');
    expect(formatAmount(-200.25)).toBe('−$200.25');
    expect(formatAmount(50, { withSign: true })).toBe('+$50.00');
    expect(formatAmount(Number.NaN)).toBe('—');
  });

  it('formats timestamps and tolerates junk', () => {
    expect(formatDateTime('2026-09-28T09:12:44.101Z')).toMatch(/2026/);
    expect(formatDateTime('not-a-date')).toBe('—');
  });

  it('labels a topup even though it has no counterparty', () => {
    expect(counterpartyLabel(null, 'topup')).toBe('Top-up');
    expect(counterpartyLabel('bob', 'transfer')).toBe('bob');
    expect(counterpartyLabel(null, 'transfer')).toBe('—');
  });

  it('describes the visible slice of the ledger', () => {
    expect(pageDescription(1, 10, 42)).toBe('1–10 of 42');
    expect(pageDescription(3, 10, 42)).toBe('21–30 of 42');
    expect(pageDescription(5, 10, 42)).toBe('41–42 of 42');
    expect(pageDescription(1, 10, 0)).toBe('No transactions');
  });
});
