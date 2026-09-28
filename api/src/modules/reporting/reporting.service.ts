import { Injectable } from '@nestjs/common';
import { ForbiddenError, NotFoundError } from '../../domain/errors';
import type { AuthenticatedUser } from '../../common/types';
import { moneyToNumber } from '../../domain/money';
import { normalizeUsername } from '../../domain/username';
import { DEFAULT_TOP_LIMIT } from '../../config/limits';
import { TransactionFilters } from '../../http/dto/reporting.dto';
import type { LedgerRow } from '../../repositories/transaction.repository';
import { TransactionRepository } from '../../repositories/transaction.repository';
import { UserRepository } from '../../repositories/user.repository';

/** A ranking entry for `GET /transactions/top`: the counterparty and the signed amount. */
export interface TopTransactionView {
  username: string;
  amount: number;
}

/** A ranking entry for `GET /users/top`. */
export interface TopUserView {
  username: string;
  transactedValue: number;
}

/** A page of a ledger plus the metadata and totals the dashboard renders around it. */
export interface LedgerPageView {
  data: LedgerRow[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
  summary: { creditTotal: number; debitTotal: number; net: number };
}

export interface LedgerPageQuery {
  requester: AuthenticatedUser;
  /** Admin only: read somebody else's wallet. Any casing is accepted. */
  targetUsername?: string;
  page: number;
  perPage: number;
  filters?: TransactionFilters;
}

/** Empty state: a wallet with no entries still has one page, otherwise a client renders "page 0 / 0". */
const MINIMUM_PAGES = 1;

/**
 * Read-only reporting use cases: the two rankings and the paginated ledger.
 *
 * Two things are deliberate here. Money leaves this service as plain numbers — the JSON number the
 * contract documents — because rounding to cents is a presentation rule and doing it once, here,
 * keeps every caller (HTTP today, anything else tomorrow) consistent. And the page, its total and
 * its summary are issued **concurrently**: three independent queries over the same filters, never one
 * query per row.
 */
@Injectable()
export class ReportingService {
  constructor(
    private readonly users: UserRepository,
    private readonly transactions: TransactionRepository,
  ) {}

  /**
   * The wallet's largest transactions by value, largest first. Debits come back negative, so the sign
   * survives into a chart; topups are excluded because they have no counterparty.
   */
  async getTopTransactions({ userId, limit = DEFAULT_TOP_LIMIT }: { userId: number; limit?: number }): Promise<TopTransactionView[]> {
    const rows = await this.transactions.findTopByValueForUser(userId, limit);
    return rows.map((row) => ({ username: row.counterparty, amount: moneyToNumber(row.amount) }));
  }

  /** Users ranked by the total value they sent, highest first. */
  async getTopUsers({ limit = DEFAULT_TOP_LIMIT }: { limit?: number } = {}): Promise<TopUserView[]> {
    const rows = await this.transactions.findTopUsersByTransactedValue(limit);
    return rows.map((row) => ({
      username: row.username,
      transactedValue: moneyToNumber(row.transactedValue),
    }));
  }

  /**
   * One page of a ledger, with filters applied consistently to the rows, the total and the summary.
   *
   * @throws {ForbiddenError} when a non-admin asks for somebody else's wallet
   * @throws {NotFoundError} when an admin names a wallet that does not exist
   */
  async getTransactionPage({
    requester,
    targetUsername,
    page,
    perPage,
    filters = {},
  }: LedgerPageQuery): Promise<LedgerPageView> {
    const userId = await this.resolveWalletId(requester, targetUsername);

    const [data, total, summary] = await Promise.all([
      this.transactions.findPageForUser({ userId, filters, page, perPage }),
      this.transactions.countForUser({ userId, filters }),
      this.transactions.summariseForUser({ userId, filters }),
    ]);

    const creditTotal = moneyToNumber(summary.creditTotal);
    const debitTotal = moneyToNumber(summary.debitTotal);
    return {
      data,
      meta: { page, perPage, total, totalPages: Math.max(MINIMUM_PAGES, Math.ceil(total / perPage)) },
      // `net` is derived from the two rounded totals, so the three numbers always add up on screen.
      summary: { creditTotal, debitTotal, net: moneyToNumber(creditTotal - debitTotal) },
    };
  }

  /**
   * Which wallet a listing is about.
   *
   * Without `targetUsername` it is the caller's own wallet — no lookup, and no need for a role, which
   * is why own-username requests never need the admin claim. Seeing another wallet is the one
   * privilege the specification reserves for admins, and the check happens before the lookup so a
   * non-admin cannot even probe which wallets exist.
   */
  private async resolveWalletId(requester: AuthenticatedUser, targetUsername?: string): Promise<number> {
    if (targetUsername === undefined) return requester.id;

    const username = normalizeUsername(targetUsername, 'username');
    if (username === requester.username) return requester.id;
    if (requester.role !== 'admin') {
      throw new ForbiddenError('Admin access is required to view another wallet.');
    }

    const wallet = await this.users.findByUsername(username);
    if (!wallet) throw new NotFoundError(`Wallet "${username}" does not exist.`);
    return wallet.id;
  }
}
