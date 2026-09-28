import {
  InsufficientBalanceError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../domain/errors.js';
import {
  centsToAmount,
  formatCents,
  formatSignedCents,
  toAmount,
  toCents,
} from '../domain/money.js';
import { normalizeUsername } from '../domain/username.js';

/**
 * Wallet use cases: read a balance, top it up, move money between two wallets.
 *
 * All money rules live here (and in domain/money.js), so the HTTP layer only has to translate
 * input, and repositories only read/write rows.
 *
 * Concurrency: every balance change runs inside one database transaction via `unitOfWork`. Transfers
 * take row locks in ascending id order before reading balances, and the debit UPDATE is additionally
 * guarded by `balance + delta >= 0`, so concurrent requests cannot overdraw a wallet even if several
 * arrive at exactly the same time.
 */
export function createWalletService({ userRepository, unitOfWork }) {
  return {
    /**
     * @param {{ userId: number, amount: number }} input
     * @returns {Promise<number>} the new balance
     * @throws {ValidationError} for amounts <= 0, >= 10,000,000 or with more than 2 decimals
     * @throws {NotFoundError} when the token refers to a user that no longer exists
     */
    async topup({ userId, amount }) {
      const cents = toCents(amount);
      const credit = formatCents(cents);

      return unitOfWork.run(async ({ users, transactions }) => {
        const updated = await users.adjustBalance(userId, credit);
        if (!updated) {
          throw new NotFoundError('User not found.');
        }
        // The ledger row and the balance move together: either both land, or neither does.
        await transactions.insert({ type: 'topup', toUserId: userId, amount: credit });
        return updated.balance;
      });
    },

    /**
     * @param {{ userId: number }} input
     * @returns {Promise<number>} the current balance
     * @throws {UnauthorizedError} when the token refers to a deleted user
     */
    async getBalance({ userId }) {
      const user = await userRepository.findById(userId);
      if (!user) {
        throw new UnauthorizedError('Token refers to an unknown user.');
      }
      return user.balance;
    },

    /**
     * Move money from the authenticated user's wallet to another username.
     *
     * @param {{ fromUserId: number, toUsername: string, amount: number }} input
     * @returns {Promise<number>} the sender's new balance
     * @throws {NotFoundError} when `toUsername` does not exist
     * @throws {ValidationError} for self transfers or invalid amounts
     * @throws {InsufficientBalanceError} when the sender cannot cover the amount
     */
    async transfer({ fromUserId, toUsername, amount }) {
      const cents = toCents(amount);
      const recipientName = normalizeUsername(toUsername, 'to_username');

      return unitOfWork.run(async ({ users, transactions }) => {
        const recipient = await users.findByUsername(recipientName);
        if (!recipient) {
          throw new NotFoundError(`User "${recipientName}" does not exist.`);
        }
        if (recipient.id === fromUserId) {
          throw new ValidationError('Cannot transfer to yourself.');
        }

        // Lock both wallets (ascending id) before reading balances, which is what makes the
        // read-check-write below safe against concurrent transfers.
        const locked = await users.lockByIds([fromUserId, recipient.id]);
        const sender = locked.find((user) => user.id === fromUserId);
        if (!sender) {
          throw new UnauthorizedError('Token refers to an unknown user.');
        }

        const balanceCents = Math.round(sender.balance * 100);
        if (balanceCents < cents) {
          throw new InsufficientBalanceError(
            `Insufficient balance: ${formatCents(balanceCents)} available, ${formatCents(cents)} requested.`,
            { balance: toAmount(sender.balance), requested: centsToAmount(cents) },
          );
        }

        const debited = await users.adjustBalance(fromUserId, formatSignedCents(-cents));
        if (!debited) {
          // Unreachable while the lock is held; kept as a hard stop so a future refactor cannot
          // silently allow an overdraft.
          throw new InsufficientBalanceError('Insufficient balance.', {
            balance: toAmount(sender.balance),
            requested: centsToAmount(cents),
          });
        }
        await users.adjustBalance(recipient.id, formatCents(cents));
        await transactions.insert({
          type: 'transfer',
          fromUserId,
          toUserId: recipient.id,
          amount: formatCents(cents),
        });

        return debited.balance;
      });
    },
  };
}
