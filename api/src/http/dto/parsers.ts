import { ValidationError } from '../../domain/errors';

/**
 * Shared primitives for turning raw request input into typed values.
 *
 * These are the API's "forms": they decide only shape (is it an object? which type? which range?).
 * Rules that need the database (does the user exist?) or business meaning (is the amount valid?) stay
 * in the services. Amounts deliberately pass through here untouched — `toMoney()` in the wallet
 * service is the single authority on what a valid amount is.
 */
export type JsonObject = Record<string, unknown>;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;


/** @throws {ValidationError} when the body is not a plain JSON object */
export function requireJsonObject(body: unknown, field = 'request body'): JsonObject {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError(`"${field}" must be a JSON object.`, { field });
  }
  return body as JsonObject;
}

/** @throws {ValidationError} when a required field is missing or blank */
export function requiredField(body: JsonObject, field: string): unknown {
  const value = body[field];
  if (value === undefined || value === null || value === '') {
    throw new ValidationError(`"${field}" is required.`, { field });
  }
  return value;
}

/**
 * An absent or blank string query parameter means "no filter".
 *
 * A repeated parameter (`?q=a&q=b`) is rejected rather than resolved to "whichever one we picked":
 * guessing which value the caller meant is exactly the kind of ambiguity a wallet API must not have.
 */
export function optionalStringQuery(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new ValidationError(`"${field}" must be a string.`, { field });
  }
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Parse an integer query parameter with a default and hard bounds.
 *
 * @throws {ValidationError} for a non-integer, a value below `min` or above `max`
 */
export function integerQuery(
  value: unknown,
  { field, fallback, min, max }: { field: string; fallback: number; min: number; max: number },
): number {
  const raw = optionalStringQuery(value, field);
  if (raw === undefined) return fallback;

  if (!/^[+-]?\d+$/.test(raw)) {
    throw new ValidationError(`"${field}" must be an integer between ${min} and ${max}.`, { field });
  }
  const parsed = Number(raw);
  if (parsed < min || parsed > max) {
    throw new ValidationError(`"${field}" must be an integer between ${min} and ${max}.`, { field });
  }
  return parsed;
}

/** A free-text search term, trimmed and length capped so it stays index friendly. */
export function searchTermQuery(value: unknown, field: string, maxLength = 64): string | undefined {
  const raw = optionalStringQuery(value, field);
  if (raw === undefined) return undefined;
  if (raw.length > maxLength) {
    throw new ValidationError(`"${field}" must not exceed ${maxLength} characters.`, { field });
  }
  return raw;
}

/**
 * A `YYYY-MM-DD` date from the query string, converted to the UTC instant at its start.
 *
 * Days are the unit the dashboard filters by; resolving them to instants here means the SQL layer
 * compares timestamps only (half-open `>= from AND < nextDay(to)`).
 *
 * @throws {ValidationError} for a malformed or impossible date such as `2026-02-30`
 */
export function dateBoundQuery(value: unknown, field: string, dayOffset = 0): Date | undefined {
  const raw = optionalStringQuery(value, field);
  if (raw === undefined) return undefined;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) {
    throw new ValidationError(`"${field}" must be a date in YYYY-MM-DD format.`, { field });
  }
  const [, year, month, day] = match;
  const written = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  // Date.UTC rolls impossible dates over (2026-02-30 → 2026-03-02), so read the year back and compare.
  if (written.toISOString().slice(0, 10) !== raw) {
    throw new ValidationError(`"${field}" is not a valid calendar date.`, { field });
  }
  return new Date(written.getTime() + dayOffset * MILLISECONDS_PER_DAY);
}

/** A `to` bound is inclusive of the whole day, i.e. the start of the following day. */
export function endOfDayQuery(value: unknown, field: string): Date | undefined {
  return dateBoundQuery(value, field, 1);
}
