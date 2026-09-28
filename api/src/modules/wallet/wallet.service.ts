import { Injectable } from '@nestjs/common';
import {
  InsufficientBalanceError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../domain/errors';
import { moneyToNumber, toMoney } from '../../domain/money';
import { normalizeUsername } from '../../domain/username';
import { TransactionRepository } from '../../repositories/transaction.repository';
import { UnitOfWork } from '../../repositories/unit-of-work';
import { UserRepository } from '../../repositories/user.repository';

export interface TopupCommand {
  userId: number;
  /** Raw amount from the request; validity is decided by `toMoney`. */
  amount: unknown;
}

export interface TransferCommand {
  fromUserId: number;
  toUsername: string;
  amount: unknown;
}

/** A token whose account no longer exists: the identity is unusable, hence 401 and not 404. */
const UNKNOWN_ACCOUNT = 'Account no longer exists.';

/** Every write path returns the balance the caller cares about, as the JSON number of the contract. */
type Balance = number;

/**
 * Wallet use cases: read a balance, top up, transfer.
 *
 * This is where the money rules live, and the ordering of the checks is part of them:
 *
 *   1. the amount is validated **before** anything is read, so a malformed request costs no query,
 *   2. the recipient is resolved **before** the locks, because the locks need its id,
 *   3. both rows are locked **before** the balance is tested, so the test cannot go stale,
 *   4. the balance is changed and the ledger row written in the **same** transaction, so a balance
 *      and its history can never disagree.
 *
 * Balances are always moved by `UserRepository.adjustBalance` (`SET balance = balance + $delta`), and
 * the database's `CHECK (balance >= 0)` is the final line of defence behind the check in step 3.
 */
@Injectable()
export class WalletService {
  constructor(
    private readonly users: UserRepository,
    private readonly transactions: TransactionRepository,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  /** @throws {UnauthorizedError} when the token outlives its account */
  async getBalance({ userId }: { userId: number }): Promise<Balance> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedError(UNKNOWN_ACCOUNT);
    return moneyToNumber(user.balance);
  }

  /**
   * Credit a wallet and record the topup as a ledger entry without a sender, so a wallet's history
   * always explains its balance (`credits - debits = balance`) instead of starting from nowhere.
   *
   * @throws {ValidationError} for an invalid amount
   * @throws {NotFoundError} when the wallet no longer exists
   */
  async topup({ userId, amount }: TopupCommand): Promise<Balance> {
    const money = toMoney(amount);

    return this.unitOfWork.run(async (db) => {
      const [user] = await this.users.lockByIds([userId], db);
      if (!user) throw new NotFoundError('User not found.');

      const updated = await this.users.adjustBalance(userId, money, db);
      if (!updated) throw new NotFoundError('User not found.');

      await this.transactions.create(
        { type: 'topup', fromUserId: null, toUserId: userId, amount: money },
        db,
      );
      return moneyToNumber(updated.balance);
    });
  }

  /**
   * Move money from one wallet to another.
   *
   * @returns the sender's balance after the transfer
   * @throws {ValidationError} for an invalid amount, or for transferring to yourself
   * @throws {NotFoundError} when the recipient does not exist
   * @throws {UnauthorizedError} when the sender's account no longer exists
   * @throws {InsufficientBalanceError} when the sender cannot cover the amount (nothing is written)
   */
  async transfer({ fromUserId, toUsername, amount }: TransferCommand): Promise<Balance> {
    const money = toMoney(amount);
    const username = normalizeUsername(toUsername, 'to_username');

    return this.unitOfWork.run(async (db) => {
      const recipient = await this.users.findByUsername(username, db);
      if (!recipient) throw new NotFoundError(`Recipient "${username}" does not exist.`);
      if (recipient.id === fromUserId) throw new ValidationError('Cannot transfer to yourself.');

      // Ascending id order inside lockByIds is what stops A→B and B→A from deadlocking.
      const locked = await this.users.lockByIds([fromUserId, recipient.id], db);
      const sender = locked.find((user) => user.id === fromUserId);
      if (!sender) throw new UnauthorizedError(UNKNOWN_ACCOUNT);

      if (sender.balance.lessThan(money)) {
        throw new InsufficientBalanceError(
          `Insufficient balance: ${moneyToNumber(sender.balance).toFixed(2)} available, ` +
            `${moneyToNumber(money).toFixed(2)} requested.`,
          { balance: moneyToNumber(sender.balance), requested: moneyToNumber(money) },
        );
      }

      const debited = await this.users.adjustBalance(sender.id, money.negated(), db);
      if (!debited) throw new UnauthorizedError(UNKNOWN_ACCOUNT);

      const credited = await this.users.adjustBalance(recipient.id, money, db);
      if (!credited) throw new NotFoundError(`Recipient "${username}" does not exist.`);

      await this.transactions.create(
        { type: 'transfer', fromUserId: sender.id, toUserId: recipient.id, amount: money },
        db,
      );
      return moneyToNumber(debited.balance);
    });
  }
}
