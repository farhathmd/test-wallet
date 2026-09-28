/**
 * Transaction (ledger) data access.
 *
 * The ledger is read from the point of view of one user: rows where that user was the sender
 * (debit) or the receiver (credit). That user id is parameter $1 in every statement, and the
 * direction/sign is computed in SQL so the rules cannot drift between endpoints.
 *
 * Filtering is expressed as NULL guarded predicates rather than concatenated SQL: one static,
 * fully parameterised statement per query, with optional filters switched off by passing null.
 */
const JOIN_CLAUSE = `
  JOIN users tu ON tu.id = t.to_user_id
  LEFT JOIN users fu ON fu.id = t.from_user_id
`;

/**
 * The other party as seen by $1 (the perspective user): when they received the money it is the
 * sender, when they sent it the recipient. For a topup the sender is NULL, so no counterparty is
 * reported (and searching can never match a topup).
 */
const COUNTERPARTY = `CASE WHEN t.to_user_id = $1 THEN fu.username ELSE tu.username END`;

/** Shared by the page, count and summary queries so the three can never disagree. */
const FILTER_CLAUSE = `
  (t.from_user_id = $1 OR t.to_user_id = $1)
  AND ($2::text IS NULL OR t.type = $2::text)
  AND ($3::text IS NULL OR (CASE WHEN t.to_user_id = $1 THEN 'credit' ELSE 'debit' END) = $3::text)
  AND ($4::timestamptz IS NULL OR t.created_at >= $4::timestamptz)
  AND ($5::timestamptz IS NULL OR t.created_at < $5::timestamptz)
  AND ($6::text IS NULL OR ${COUNTERPARTY} ILIKE '%' || $6::text || '%' ESCAPE '\\')
`;

/** Signed, direction aware amount: a debit is negative for the user being asked about. */
const SIGNED_AMOUNT = `CASE WHEN t.from_user_id = $1 THEN -t.amount ELSE t.amount END`;

/** @param {string|undefined|null} value */
function nullify(value) {
  return value === undefined || value === '' ? null : value;
}

/**
 * Bind the shared filter parameters in the order FILTER_CLAUSE expects.
 * @param {number} userId perspective ("whose transactions?")
 * @param {{ type?: string, direction?: string, from?: string, to?: string, q?: string }} filters
 */
function filterParams(userId, filters = {}) {
  return [
    userId,
    nullify(filters.type),
    nullify(filters.direction),
    nullify(filters.from),
    nullify(filters.to),
    nullify(filters.q),
  ];
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db pool or transaction client
 */
export function createTransactionRepository(db) {
  return {
    /**
     * Append an immutable ledger row.
     * @param {{ type: 'topup'|'transfer', fromUserId: number|null, toUserId: number, amount: string }} entry
     */
    async insert({ type, fromUserId = null, toUserId, amount }) {
      const { rows } = await db.query(
        `
          INSERT INTO transactions (type, from_user_id, to_user_id, amount)
          VALUES ($1, $2, $3, $4::numeric)
          RETURNING id, type, from_user_id, to_user_id, amount, created_at
        `,
        [type, fromUserId, toUserId, amount],
      );
      return rows[0];
    },

    /**
     * Top N transactions by absolute value for one user, debits returned as negative amounts.
     * Credited and debited transfers are both considered, ordered by |amount| descending.
     *
     * @param {number} userId
     * @param {number} limit
     * @returns {Promise<Array<{ counterparty: string, amount: number }>>}
     */
    async findTopByValueForUser(userId, limit) {
      const { rows } = await db.query(
        `
          SELECT ranked.counterparty, ranked.amount
          FROM (
            SELECT ${COUNTERPARTY} AS counterparty,
                   ${SIGNED_AMOUNT} AS amount,
                   t.id             AS id
            FROM transactions t
            ${JOIN_CLAUSE}
            WHERE t.type = 'transfer'
              AND (t.from_user_id = $1 OR t.to_user_id = $1)
          ) AS ranked
          ORDER BY abs(ranked.amount) DESC, ranked.id DESC
          LIMIT $2
        `,
        [userId, limit],
      );
      return rows.map((row) => ({ counterparty: row.counterparty, amount: Number(row.amount) }));
    },

    /**
     * Users ranked by the total value they sent out (outbound transfers only).
     * @param {number} limit
     * @returns {Promise<Array<{ username: string, transactedValue: number }>>}
     */
    async findTopUsersByTransactedValue(limit) {
      const { rows } = await db.query(
        `
          SELECT u.username, SUM(t.amount) AS transacted_value
          FROM transactions t
          JOIN users u ON u.id = t.from_user_id
          WHERE t.type = 'transfer'
          GROUP BY u.id, u.username
          ORDER BY transacted_value DESC, u.username ASC
          LIMIT $1
        `,
        [limit],
      );
      return rows.map((row) => ({
        username: row.username,
        transactedValue: Number(row.transacted_value),
      }));
    },

    /**
     * One page of a user's ledger for the dashboard table.
     * @param {{ userId: number, filters?: object, limit: number, offset: number }} query
     */
    async findPageForUser({ userId, filters = {}, limit, offset }) {
      const { rows } = await db.query(
        `
          SELECT t.id,
                 t.type,
                 t.amount,
                 t.created_at,
                 CASE WHEN t.to_user_id = $1 THEN 'credit' ELSE 'debit' END AS direction,
                 ${COUNTERPARTY} AS counterparty
          FROM transactions t
          ${JOIN_CLAUSE}
          WHERE ${FILTER_CLAUSE}
          ORDER BY t.created_at DESC, t.id DESC
          LIMIT $7 OFFSET $8
        `,
        [...filterParams(userId, filters), limit, offset],
      );
      return rows.map((row) => ({
        id: Number(row.id),
        type: row.type,
        direction: row.direction,
        counterparty: row.counterparty,
        amount: Number(row.amount),
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      }));
    },

    /**
     * Total number of rows matching the same filters (independent of the requested page).
     * @param {{ userId: number, filters?: object }} query
     * @returns {Promise<number>}
     */
    async countForUser({ userId, filters = {} }) {
      const { rows } = await db.query(
        `
          SELECT count(*)::int AS total
          FROM transactions t
          ${JOIN_CLAUSE}
          WHERE ${FILTER_CLAUSE}
        `,
        filterParams(userId, filters),
      );
      return rows[0]?.total ?? 0;
    },

    /**
     * Credit/debit totals for the whole filtered set, used by the dashboard stat cards.
     * @param {{ userId: number, filters?: object }} query
     * @returns {Promise<{ creditTotal: number, debitTotal: number }>}
     */
    async summariseForUser({ userId, filters = {} }) {
      const { rows } = await db.query(
        `
          SELECT COALESCE(SUM(t.amount) FILTER (WHERE t.to_user_id = $1), 0)   AS credit_total,
                 COALESCE(SUM(t.amount) FILTER (WHERE t.from_user_id = $1), 0) AS debit_total
          FROM transactions t
          ${JOIN_CLAUSE}
          WHERE ${FILTER_CLAUSE}
        `,
        filterParams(userId, filters),
      );
      return {
        creditTotal: Number(rows[0]?.credit_total ?? 0),
        debitTotal: Number(rows[0]?.debit_total ?? 0),
      };
    },
  };
}
