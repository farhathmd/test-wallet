import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ValidationError } from '../../src/domain/errors.js';
import {
  centsToAmount,
  formatCents,
  formatSignedCents,
  MAX_AMOUNT,
  toAmount,
  toCents,
} from '../../src/domain/money.js';

/**
 * Money is the part of this service that must never be approximate, so the bounds and the
 * conversion to integer cents are pinned down here.
 */
describe('domain/money', () => {
  describe('toCents', () => {
    it('converts valid amounts to exact integer cents', () => {
      assert.equal(toCents(0.01), 1);
      assert.equal(toCents(0.1), 10);
      assert.equal(toCents(10), 1000);
      assert.equal(toCents(1234.56), 123456);
      assert.equal(toCents(MAX_AMOUNT - 0.01), 999_999_999);
    });

    it('avoids floating point drift that would corrupt balances', () => {
      // The classic trap: 0.1 + 0.2 === 0.30000000000000004 in floats, but not in cents.
      assert.equal(toCents(0.1) + toCents(0.2), toCents(0.3));
      assert.equal(toCents(0.07) * 3, toCents(0.21));
    });

    it('rejects zero and negative amounts', () => {
      for (const value of [0, -0.01, -100]) {
        assert.throws(() => toCents(value), ValidationError);
      }
    });

    it('enforces the documented upper bound of 10,000,000 (exclusive)', () => {
      assert.throws(() => toCents(MAX_AMOUNT), /less than 10000000/);
      assert.throws(() => toCents(MAX_AMOUNT + 1), ValidationError);
      assert.doesNotThrow(() => toCents(MAX_AMOUNT - 0.01));
    });

    it('rejects amounts with more than two decimals', () => {
      assert.throws(() => toCents(1.234), /2 decimal places/);
      assert.throws(() => toCents(0.001), ValidationError);
    });

    it('rejects values that are not finite numbers', () => {
      for (const value of ['10', null, undefined, true, {}, [], Number.NaN, Number.POSITIVE_INFINITY]) {
        assert.throws(() => toCents(value), ValidationError, `expected ${JSON.stringify(value)} to be rejected`);
      }
    });

    it('names the offending field in the error', () => {
      assert.throws(() => toCents('nope', 'amount'), /"amount"/);
      assert.throws(() => toCents(0, 'amount'), /"amount"/);
    });
  });

  describe('formatting', () => {
    it('renders cents as fixed scale decimals for NUMERIC columns', () => {
      assert.equal(formatCents(1), '0.01');
      assert.equal(formatCents(1000), '10.00');
      assert.equal(formatCents(999_999_999), '9999999.99');
    });

    it('renders signed decimals for balance deltas', () => {
      assert.equal(formatSignedCents(-1050), '-10.50');
      assert.equal(formatSignedCents(1050), '10.50');
    });

    it('refuses non-integer cents instead of silently truncating', () => {
      assert.throws(() => formatCents(10.5), TypeError);
      assert.throws(() => formatCents(Number.NaN), TypeError);
    });

    it('converts cents back to a decimal amount', () => {
      assert.equal(centsToAmount(1), 0.01);
      assert.equal(centsToAmount(10001), 100.01);
      assert.equal(centsToAmount(0), 0);
      assert.throws(() => centsToAmount(10.5), TypeError);
    });

    it('normalises values read back from Postgres to two decimals', () => {
      assert.equal(toAmount('10.50'), 10.5);
      assert.equal(toAmount('0.01'), 0.01);
      assert.equal(toAmount(9999999.99), 9999999.99);
      assert.equal(toAmount(0), 0);
    });
  });
});
