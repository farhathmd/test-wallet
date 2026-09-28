import {
  serializeTopTransactions,
  serializeTopUsers,
  serializeTransactionPage,
} from '../serializers/transaction.serializer.js';
import { parseLimitQuery, parseTransactionListQuery } from '../validators/request.js';

/**
 * HTTP handlers for the dashboard read endpoints.
 *
 * @param {{ reportingService: object }} dependencies
 */
export function createReportingController({ reportingService }) {
  return {
    /** GET /transactions/top → 200 [{ username, amount }] for the authenticated user. */
    async topTransactions(req, res) {
      const { limit } = parseLimitQuery(req.query);
      const rows = await reportingService.getTopTransactions({ userId: req.user.id, limit });
      res.status(200).json(serializeTopTransactions(rows));
    },

    /** GET /users/top → 200 [{ username, transacted_value }] across all users. */
    async topUsers(req, res) {
      const { limit } = parseLimitQuery(req.query);
      const rows = await reportingService.getTopUsers({ limit });
      res.status(200).json(serializeTopUsers(rows));
    },

    /**
     * GET /transactions → 200 page of the requester's ledger with search, filters and paging.
     * An admin may add `?username=<other>` to inspect another wallet (`service` enforces that rule).
     */
    async listTransactions(req, res) {
      const { page, perPage, username, filters } = parseTransactionListQuery(req.query);
      const result = await reportingService.getTransactionPage({
        requester: req.user,
        targetUsername: username,
        page,
        perPage,
        filters,
      });
      res.status(200).json(serializeTransactionPage(result));
    },
  };
}
