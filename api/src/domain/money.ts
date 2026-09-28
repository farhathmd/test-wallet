import { ValidationError } from './errors';
// The generated client exports `Prisma` as a namespace, so `Prisma.Decimal` is available both as a
// value (to construct) and as a type (to annotate). It is decimal.js under the hood.
import { Prisma } from '../generated/prisma/client';

/**
 * Money rules, used by the request validators and the wallet service alike.
 *
 * Amounts arrive from clients as JSON numbers, so they are validated as numbers (bounds, at most two
 * decimal places) and then converted **once** into an exact `Prisma.Decimal`. Everything downstream —
 * services, the ledger, Postgres NUMERIC(20,2) — works with that exact value: no `0.1 + 0.2`
 * rounding error can ever reach a balance.
 *
 * A value that is *not* a number throws, so `"10"` or `true` is rejected instead of being coerced:
 * silently accepting a string here would make the API's behaviour depend on a client's JSON encoding.
 */
export type Money = Prisma.Decimal;

/** Largest accepted amount, exclusive: 10,000,000. */
export const MAX_AMOUNT = 10_000_000;
const CENTS_PER_UNIT = 100;
/**
 * Tolerance for "has at most two decimals": `0.1 + 0.2` is 0.30000000000000004 in IEEE-754 and is
 * meant to be 0.30. Anything coarser than a half cent is a genuinely malformed amount.
 */
const DECIMAL_TOLERANCE = 1e-6;

/**
 * Validate a raw amount and convert it to an exact decimal.
 *
 * @param value raw JSON value from the request body
 * @param field name used in error messages
 * @throws {ValidationError} when the value is not a finite number within the allowed range
 */
export function toMoney(value: unknown, field = 'amount'): Money {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError(`"${field}" must be a finite number.`, { field });
  }
  if (value >= MAX_AMOUNT) {
    throw new ValidationError(`"${field}" must be less than ${MAX_AMOUNT}.`, { field });
  }
  if (value <= 0) {
    throw new ValidationError(`"${field}" must be greater than 0.`, { field });
  }

  const cents = Math.round(value * CENTS_PER_UNIT);
  if (Math.abs(value * CENTS_PER_UNIT - cents) > DECIMAL_TOLERANCE) {
    throw new ValidationError(`"${field}" supports at most 2 decimal places.`, { field });
  }

  // Built from the integer cent count, so the decimal is exact (12.34, never 12.339999...).
  return new Prisma.Decimal(cents).dividedBy(CENTS_PER_UNIT);
}

/**
 * Convert a stored amount back into the JSON number form the API contract uses.
 * Always two-decimal-safe, so `balance` never serialises as `10.000000000000002`.
 */
export function moneyToNumber(value: Money | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return Math.round(Number(value) * CENTS_PER_UNIT) / CENTS_PER_UNIT;
}
