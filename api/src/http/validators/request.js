import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_TOP_LIMIT,
  MAX_PAGE_SIZE,
  MAX_TOP_LIMIT,
} from '../../config/limits.js';
import { validatePassword } from '../../domain/password.js';
import { normalizeUsername } from '../../domain/username.js';
import { ValidationError } from '../../domain/errors.js';

/**
 * Request validators — the trust boundary.
 *
 * These functions answer "is the request shaped correctly?" (required fields, types, enumerations).
 * Business rules such as amount bounds, decimal places and permission checks stay in the domain and
 * service layers, so a rule is never implemented twice.
 */
const TRANSACTION_TYPES = ['topup', 'transfer'];
const DIRECTIONS = ['credit', 'debit'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SEARCH_MAX_LENGTH = 64;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** @param {unknown} value */
function assertJsonObject(value, field = 'body') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`Request ${field} must be a JSON object.`, { field });
  }
  return value;
}

/**
 * @param {object} source
 * @param {string} field
 * @returns {unknown} the raw value; the domain layer validates its type and range
 */
function requiredField(source, field) {
  const value = source[field];
  if (value === undefined || value === null || value === '') {
    throw new ValidationError(`"${field}" is required.`, { field });
  }
  return value;
}

/**
 * @param {unknown} raw
 * @param {string} field
 * @param {number} fallback
 * @param {number} max
 */
function positiveInteger(raw, field, fallback, max) {
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new ValidationError(`"${field}" must be an integer between 1 and ${max}.`, { field });
  }
  return parsed;
}

/**
 * @param {unknown} raw
 * @param {string} field
 * @param {string[]} allowed
 * @returns {string|undefined}
 */
function optionalEnum(raw, field, allowed) {
  if (raw === undefined || raw === '') return undefined;
  if (typeof raw !== 'string' || !allowed.includes(raw)) {
    throw new ValidationError(`"${field}" must be one of: ${allowed.join(', ')}.`, { field });
  }
  return raw;
}

/**
 * Parse a YYYY-MM-DD date as UTC midnight.
 * @param {unknown} raw
 * @param {string} field
 * @returns {string|null} ISO timestamp, or null when the filter is absent
 */
function optionalDate(raw, field) {
  if (raw === undefined || raw === '') return null;
  if (typeof raw !== 'string' || !DATE_PATTERN.test(raw)) {
    throw new ValidationError(`"${field}" must be a date in YYYY-MM-DD format.`, { field });
  }
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    throw new ValidationError(`"${field}" is not a valid calendar date.`, { field });
  }
  return parsed.toISOString();
}

/**
 * Body of POST /register.
 * `password` is optional: the wallet API registers by username, the dashboard logs in with a
 * password, and accounts registered without one simply cannot use /login.
 */
export function parseRegisterBody(body) {
  const input = assertJsonObject(body);
  return {
    username: normalizeUsername(requiredField(input, 'username')),
    password: validatePassword(input.password),
  };
}

/** Body of POST /login (used by the dashboard). */
export function parseLoginBody(body) {
  const input = assertJsonObject(body);
  return {
    username: normalizeUsername(requiredField(input, 'username')),
    password: validatePassword(requiredField(input, 'password'), { required: true }),
  };
}

/** Body of POST /topup. Range/decimal rules live in domain/money.js. */
export function parseTopupBody(body) {
  const input = assertJsonObject(body);
  return { amount: requiredField(input, 'amount') };
}

/** Body of POST /transfer. */
export function parseTransferBody(body) {
  const input = assertJsonObject(body);
  return {
    toUsername: normalizeUsername(requiredField(input, 'to_username'), 'to_username'),
    amount: requiredField(input, 'amount'),
  };
}

/** Query of GET /transactions/top and GET /users/top. */
export function parseLimitQuery(query = {}) {
  return { limit: positiveInteger(query.limit, 'limit', DEFAULT_TOP_LIMIT, MAX_TOP_LIMIT) };
}

/** Query of GET /transactions. */
export function parseTransactionListQuery(query = {}) {
  const from = optionalDate(query.from, 'from');
  const to = optionalDate(query.to, 'to');
  if (from && to && from > to) {
    throw new ValidationError('"from" must not be later than "to".', { field: 'from' });
  }

  const search = query.q;
  if (search !== undefined && typeof search !== 'string') {
    throw new ValidationError('"q" must be a string.', { field: 'q' });
  }
  const trimmedSearch = typeof search === 'string' ? search.trim() : '';
  if (trimmedSearch.length > SEARCH_MAX_LENGTH) {
    throw new ValidationError(`"q" must not exceed ${SEARCH_MAX_LENGTH} characters.`, { field: 'q' });
  }

  return {
    page: positiveInteger(query.page, 'page', 1, Number.MAX_SAFE_INTEGER),
    perPage: positiveInteger(query.per_page, 'per_page', DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    username:
      query.username === undefined || query.username === '' ? undefined : String(query.username),
    filters: {
      type: optionalEnum(query.type, 'type', TRANSACTION_TYPES),
      direction: optionalEnum(query.direction, 'direction', DIRECTIONS),
      q: trimmedSearch === '' ? undefined : trimmedSearch,
      from,
      // The upper bound is exclusive so a full end day is included: 'to=2026-01-31' means
      // "everything before 2026-02-01T00:00Z".
      to: to ? new Date(new Date(to).getTime() + ONE_DAY_MS).toISOString() : undefined,
    },
  };
}

