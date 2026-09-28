/**
 * Request shaping limits, shared by the HTTP validators and the services they call so the two can
 * never disagree about what a valid `limit` is.
 */
/** "Top 10" is the documented default for both ranking endpoints. */
export const DEFAULT_TOP_LIMIT = 10;
/** Upper bound for ?limit, so a client cannot ask for the entire ledger. */
export const MAX_TOP_LIMIT = 50;

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;
