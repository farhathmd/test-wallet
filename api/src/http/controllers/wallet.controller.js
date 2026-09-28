import { serializeBalance } from '../serializers/user.serializer.js';
import { parseTopupBody, parseTransferBody } from '../validators/request.js';

/**
 * HTTP handlers for the wallet itself: balance, topup, transfer.
 *
 * `req.user` is populated by the authentication middleware, so handlers only translate the request
 * into a service call and the result into a response.
 *
 * @param {{ walletService: object }} dependencies
 */
export function createWalletController({ walletService }) {
  return {
    /** POST /topup → 204, no body (the new balance is available via GET /balance). */
    async topup(req, res) {
      const { amount } = parseTopupBody(req.body);
      await walletService.topup({ userId: req.user.id, amount });
      res.status(204).send();
    },

    /** GET /balance → 200 { balance }. */
    async getBalance(req, res) {
      const balance = await walletService.getBalance({ userId: req.user.id });
      res.status(200).json(serializeBalance(balance));
    },

    /** POST /transfer → 204 on success. */
    async transfer(req, res) {
      const { toUsername, amount } = parseTransferBody(req.body);
      await walletService.transfer({ fromUserId: req.user.id, toUsername, amount });
      res.status(204).send();
    },
  };
}
