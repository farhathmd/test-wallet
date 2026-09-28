import { Prisma } from '../generated/prisma/client';
import { ValidationError } from './errors';
import { MAX_AMOUNT, moneyToNumber, toMoney } from './money';

/**
 * Money is the part of this service that must never be approximate, so the bounds, the conversion to
 * an exact decimal and the way values come back out are pinned down here.
 */
describe('domain/money', () => {
  describe('toMoney', () => {
    it('converts valid amounts into an exact decimal', () => {
      expect(toMoney(0.01).toString()).toBe('0.01');
      expect(toMoney(0.1).toString()).toBe('0.1');
      expect(toMoney(10).toString()).toBe('10');
      expect(toMoney(1234.56).toString()).toBe('1234.56');
      expect(toMoney(MAX_AMOUNT - 0.01).toString()).toBe('9999999.99');
    });

    it('returns a decimal, so arithmetic downstream stays exact', () => {
      expect(toMoney(1.5)).toBeInstanceOf(Prisma.Decimal);
    });

    it('avoids the floating point drift that would corrupt a balance', () => {
      // The classic trap: 0.1 + 0.2 is 0.30000000000000004 in IEEE-754, and must never reach a wallet.
      expect(toMoney(0.1).plus(toMoney(0.2)).equals(toMoney(0.3))).toBe(true);
      expect(toMoney(0.07).times(3).equals(toMoney(0.21))).toBe(true);
    });

    it('rejects zero and negative amounts', () => {
      for (const value of [0, -0.01, -100]) {
        expect(() => toMoney(value)).toThrow(ValidationError);
      }
    });

    it('enforces the documented upper bound of 10,000,000 (exclusive)', () => {
      expect(() => toMoney(MAX_AMOUNT)).toThrow(/less than 10000000/);
      expect(() => toMoney(MAX_AMOUNT + 1)).toThrow(ValidationError);
      expect(() => toMoney(MAX_AMOUNT - 0.01)).not.toThrow();
    });

    it('rejects amounts with more than two decimals instead of rounding them', () => {
      expect(() => toMoney(1.234)).toThrow(/2 decimal places/);
      expect(() => toMoney(1.005)).toThrow(ValidationError);
      expect(() => toMoney(0.001)).toThrow(ValidationError);
    });

    it('rejects values that are not finite numbers, including numeric strings', () => {
      for (const value of [
        '10',
        null,
        undefined,
        true,
        {},
        [],
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
      ]) {
        expect(() => toMoney(value)).toThrow(ValidationError);
      }
    });

    it('names the offending field', () => {
      expect(() => toMoney('nope', 'amount')).toThrow(/"amount"/);
      expect(() => toMoney(0, 'amount')).toThrow(/"amount"/);
    });
  });

  describe('moneyToNumber', () => {
    it('renders a stored value as the JSON number of the contract, at two decimals', () => {
      expect(moneyToNumber(new Prisma.Decimal('10.50'))).toBe(10.5);
      expect(moneyToNumber('0.01')).toBe(0.01);
      expect(moneyToNumber(9999999.99)).toBe(9999999.99);
      expect(moneyToNumber(0)).toBe(0);
      expect(moneyToNumber(-80)).toBe(-80);
    });

    it('rounds a value that is not representable in cents', () => {
      expect(moneyToNumber(1234.567)).toBe(1234.57);
    });

    it('answers 0 for a missing value, so a caller never serialises null', () => {
      expect(moneyToNumber(null)).toBe(0);
      expect(moneyToNumber(undefined)).toBe(0);
    });
  });
});
