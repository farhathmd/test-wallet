import { ValidationError } from './errors.js';

/**
 * Money rules, in one pure module so every caller (topup and transfer) shares the same bounds.
 *
 * Amounts arrive as JSON numbers, but are converted to integer cents before they ever reach the
 * database. Cents are exact integers, so balance arithmetic never suffers from the classic
 * `0.1 + 0.2 !== 0.3` float drift. Values passed to Postgres are rendered as decimal strings so
 * NUMERIC arithmetic stays exact inside the database too.
 */

/** Per the spec, topups must be strictly below 10,000,000. */
export const MAX_AMOUNT = 10_000_000;
/** Smallest amount we accept: one cent. */
export const MIN_AMOUNT_CENTS = 1;
const CENTS_PER_UNIT = 100;
/** Tolerance used when checking that a float really has no more than 2 decimals. */
const DECIMAL_EPSILON = 1e-6;

/**
 * Convert a client supplied amount to exact integer cents.
 *
 * @param {unknown} value raw value from the request body
 * @param {string} field name used in the error message
 * @returns {number} amount in cents (> 0, < MAX_AMOUNT * 100)
 * @throws {ValidationError} when the value is not a finite, positive, 2-decimal number in range
 */
export function toCents(value, field = 'amount') {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError(`"${field}" must be a finite number.`, { field });
  }
  if (value <= 0) {
    throw new ValidationError(`"${field}" must be greater than 0.`, { field });
  }
  if (value >= MAX_AMOUNT) {
    throw new ValidationError(`"${field}" must be less than ${MAX_AMOUNT}.`, { field });
  }

  const cents = Math.round(value * CENTS_PER_UNIT);
  if (Math.abs(value * CENTS_PER_UNIT - cents) > DECIMAL_EPSILON) {
    throw new ValidationError(`"${field}" supports at most 2 decimal places.`, { field });
  }
  return cents;
}

/**
 * Render integer cents as a fixed scale decimal string for a NUMERIC column.
 * @param {number} cents
 * @returns {string} e.g. 1050 -> "10.50"
 */
export function formatCents(cents) {
  if (!Number.isSafeInteger(cents)) {
    throw new TypeError(`Expected integer cents, received ${cents}.`);
  }
  return (cents / CENTS_PER_UNIT).toFixed(2);
}

/** Render integer cents as a signed decimal string, e.g. (-1050) -> "-10.50". */
export function formatSignedCents(cents) {
  return `${cents < 0 ? '-' : ''}${formatCents(Math.abs(cents))}`;
}

/**
 * Convert integer cents back to a decimal amount — the inverse of `toCents`, used when an error
 * payload or a response needs to talk about money in the same unit the client sent.
 * @param {number} cents
 * @returns {number}
 */
export function centsToAmount(cents) {
  if (!Number.isSafeInteger(cents)) {
    throw new TypeError(`Expected integer cents, received ${cents}.`);
  }
  return cents / CENTS_PER_UNIT;
}

/**
 * Normalise a value read back from Postgres (string or number) to a 2-decimal JS number.
 * Postgres NUMERIC is exact; this only strips any representation noise before it is serialised.
 * @param {string|number|null} value
 * @returns {number}
 */
export function toAmount(value) {
  return Math.round(Number(value) * CENTS_PER_UNIT) / CENTS_PER_UNIT;
}
