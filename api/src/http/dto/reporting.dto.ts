import { parseEnum, DIRECTIONS, TRANSACTION_TYPES, type Direction, type TransactionType } from '../../domain/ledger';
import { ValidationError } from '../../domain/errors';
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_TOP_LIMIT,
  MAX_PAGE_SIZE,
  MAX_TOP_LIMIT,
  SEARCH_MAX_LENGTH,
} from '../../config/limits';
import { integerQuery, optionalStringQuery, searchTermQuery, dateBoundQuery, endOfDayQuery } from './parsers';

/** GET /transactions/top and GET /users/top. */
export interface LimitQuery {
  limit: number;
}

/** GET /transactions — paging, the admin cross-wallet switch and the ledger filters. */
export interface TransactionFilters {
  type?: TransactionType;
  direction?: Direction;
  q?: string;
  /** Inclusive lower bound, as an instant. */
  from?: Date;
  /** Exclusive upper bound: the start of the day after `to`. */
  to?: Date;
}

export interface TransactionListQuery {
  page: number;
  perPage: number;
  /** Admin-only: inspect another wallet. Forwarded un-normalised, resolved in the service. */
  username?: string;
  filters: TransactionFilters;
}

export function parseLimitQuery(query: unknown): LimitQuery {
  const raw = (query ?? {}) as Record<string, unknown>;
  return {
    limit: integerQuery(raw.limit, {
      field: 'limit',
      fallback: DEFAULT_TOP_LIMIT,
      min: 1,
      max: MAX_TOP_LIMIT,
    }),
  };
}

/**
 * `from` and `to` are the only pair whose combination can be invalid on its own, so the range check
 * lives here rather than in SQL.
 */
export function parseTransactionListQuery(query: unknown): TransactionListQuery {
  const raw = (query ?? {}) as Record<string, unknown>;
  const from = dateBoundQuery(raw.from, 'from');
  const to = endOfDayQuery(raw.to, 'to');
  if (from && to && from >= to) {
    throw new ValidationError('"from" must not be later than "to".', { from: raw.from, to: raw.to });
  }

  return {
    page: integerQuery(raw.page, { field: 'page', fallback: 1, min: 1, max: Number.MAX_SAFE_INTEGER }),
    perPage: integerQuery(raw.per_page, {
      field: 'per_page',
      fallback: DEFAULT_PAGE_SIZE,
      min: 1,
      max: MAX_PAGE_SIZE,
    }),
    username: optionalStringQuery(raw.username, 'username'),
    filters: {
      type: parseEnum(raw.type, TRANSACTION_TYPES, 'type'),
      direction: parseEnum(raw.direction, DIRECTIONS, 'direction'),
      q: searchTermQuery(raw.q, 'q', SEARCH_MAX_LENGTH),
      from,
      to,
    },
  };
}

/** The admin cross-wallet parameter is a username; it is normalised in the service, together with the
 *  permission decision that depends on it. */
