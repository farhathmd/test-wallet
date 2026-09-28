import { ConflictError } from '../domain/errors.js';
import { toAmount } from '../domain/money.js';

/**
 * User data access.
 *
 * Every statement is parameterised (never string concatenated), so a username such as
 * `robert'); DROP TABLE users; --` is just an unmatched string. Balance changes are single guarded
 * UPDATE statements: the database decides whether enough money is available, which removes the
 * read-modify-write race entirely.
 *
 * The repository is deliberately logic free: it reads and writes rows, the services decide what
 * the result means.
 */
const USER_COLUMNS = 'id, username, role, balance, password_hash, created_at';

/** @param {object|null} row */
function toUser(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    username: row.username,
    role: row.role,
    balance: toAmount(row.balance),
    passwordHash: row.password_hash,
    createdAt: row.created_at,
  };
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db pool or transaction client
 */
export function createUserRepository(db) {
  return {
    /**
     * @param {{ username: string, passwordHash?: string|null }} input
     * @returns {Promise<object>} the created user
     * @throws {ConflictError} when the username is already taken (unique violation 23505)
     */
    async insert({ username, passwordHash = null }) {
      try {
        const { rows } = await db.query(
          `INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING ${USER_COLUMNS}`,
          [username, passwordHash],
        );
        return toUser(rows[0]);
      } catch (error) {
        if (error.code === '23505') {
          throw new ConflictError('Username is already taken.');
        }
        throw error;
      }
    },

    /** @param {string} username already normalised */
    async findByUsername(username) {
      const { rows } = await db.query(`SELECT ${USER_COLUMNS} FROM users WHERE username = $1`, [
        username,
      ]);
      return toUser(rows[0]);
    },

    /** @param {number} id */
    async findById(id) {
      const { rows } = await db.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
      return toUser(rows[0]);
    },

    /**
     * Lock the given users for the remainder of the transaction, in a deterministic order.
     *
     * Ordering by id is what makes concurrent transfers safe: two opposite transfers (A→B and B→A)
     * both take the lower id first, so one waits instead of the pair deadlocking. The returned rows
     * carry the locked (and therefore current) balances, which the service uses for clear error
     * messages.
     *
     * @param {number[]} ids
     * @returns {Promise<object[]>}
     */
    async lockByIds(ids) {
      const unique = [...new Set(ids)].sort((a, b) => a - b);
      const { rows } = await db.query(
        `SELECT ${USER_COLUMNS} FROM users WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE`,
        [unique],
      );
      return rows.map(toUser);
    },

    /**
     * Apply a signed amount to a balance, atomically refusing to go below zero.
     *
     * @param {number} id
     * @param {string} signedAmount decimal string, e.g. "25.00" or "-25.00"
     * @returns {Promise<object|null>} updated user, or null when the user is unknown or the guard
     *   (`balance + delta >= 0`) rejected the change
     */
    async adjustBalance(id, signedAmount) {
      const { rows } = await db.query(
        `
          UPDATE users
             SET balance = balance + $1::numeric,
                 updated_at = now()
           WHERE id = $2
             AND balance + $1::numeric >= 0
        RETURNING ${USER_COLUMNS}
        `,
        [signedAmount, id],
      );
      return toUser(rows[0]);
    },
  };
}
