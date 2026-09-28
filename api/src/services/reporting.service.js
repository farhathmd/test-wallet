import { DEFAULT_TOP_LIMIT, MAX_TOP_LIMIT } from '../config/limits.js';
import { ForbiddenError, NotFoundError } from '../domain/errors.js';
import { toAmount } from '../domain/money.js';
import { normalizeUsername } from '../domain/username.js';

/**
 * Read models for the dashboard: per-user transaction rankings and a paginated ledger listing.
 *
 * Every method maps rows onto plain domain objects; naming the JSON fields is the serializers' job,
 * so this stays free of transport concerns.
 *
 * @param {{ transactionRepository: object, userRepository: object }} dependencies
 */
export function createReportingService({ transactionRepository, userRepository }) {
  /**
   * Decide whose ledger is being read: your own by default, somebody else's only as an admin.
   * Keeping this rule here (not in the controller) means it holds for every caller.
   *
   * @param {{ id: number, username: string, role: string }} requester
   * @param {string|undefined} targetUsername
   * @returns {Promise<number>} user id whose transactions will be listed
   */
  async function resolvePerspectiveUserId(requester, targetUsername) {
    if (!targetUsername) return requester.id;

    const normalized = normalizeUsername(targetUsername);
    if (normalized === requester.username) return requester.id;
    if (requester.role !== 'admin') {
      throw new ForbiddenError('Only an admin can view another user\'s transactions.');
    }
    const target = await userRepository.findByUsername(normalized);
    if (!target) {
      throw new NotFoundError(`User "${normalized}" does not exist.`);
    }
    return target.id;
  }

  return {
    /**
     * Top N transactions by value for one user (credits and debits), debits as negative amounts,
     * sorted by absolute value descending. Users without transactions get an empty list.
     *
     * @param {{ userId: number, limit?: number }} input
     * @returns {Promise<Array<{ username: string, amount: number }>>}
     */
    async getTopTransactions({ userId, limit = DEFAULT_TOP_LIMIT }) {
      const rows = await transactionRepository.findTopByValueForUser(userId, limit);
      return rows.map((row) => ({
        username: row.counterparty,
        amount: toAmount(row.amount),
      }));
    },

    /**
     * Users ranked by the total value of their outbound (debit) transfers.
     *
     * @param {{ limit?: number }} input
     * @returns {Promise<Array<{ username: string, transactedValue: number }>>}
     */
    async getTopUsers({ limit = DEFAULT_TOP_LIMIT }) {
      const rows = await transactionRepository.findTopUsersByTransactedValue(limit);
      return rows.map((row) => ({
        username: row.username,
        transactedValue: toAmount(row.transactedValue),
      }));
    },

    /**
     * One page of a ledger plus aggregate figures for the dashboard cards.
     *
     * The page, the filtered total and the credit/debit summary are independent reads, so they are
     * issued concurrently instead of one after another.
     *
     * @param {{ requester: object, targetUsername?: string, page: number, perPage: number, filters?: object }} input
     */
    async getTransactionPage({ requester, targetUsername, page, perPage, filters = {} }) {
      const userId = await resolvePerspectiveUserId(requester, targetUsername);

      const [data, total, summary] = await Promise.all([
        transactionRepository.findPageForUser({
          userId,
          filters,
          limit: perPage,
          offset: (page - 1) * perPage,
        }),
        transactionRepository.countForUser({ userId, filters }),
        transactionRepository.summariseForUser({ userId, filters }),
      ]);

      const creditTotal = toAmount(summary.creditTotal);
      const debitTotal = toAmount(summary.debitTotal);

      return {
        perspective: userId,
        data: data.map((row) => ({
          id: row.id,
          type: row.type,
          direction: row.direction,
          counterparty: row.counterparty,
          amount: toAmount(row.amount),
          createdAt: row.createdAt,
        })),
        meta: {
          page,
          perPage,
          total,
          totalPages: Math.max(1, Math.ceil(total / perPage)),
          summary: {
            creditTotal,
            debitTotal,
            net: toAmount(creditTotal - debitTotal),
          },
        },
      };
    },
  };
}

