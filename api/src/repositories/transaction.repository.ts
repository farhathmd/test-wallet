import { Injectable } from '@nestjs/common';
import type { Direction, TransactionType } from '../domain/ledger';
import type { Money } from '../domain/money';
import { Prisma } from '../generated/prisma/client';
import type { Transaction } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { Db } from './db';

/** One page of a wallet's ledger, already resolved from that wallet's point of view. */
export interface LedgerRow {
  id: number;
  type: TransactionType;
  direction: Direction;
  /** The other wallet, or null for a topup. */
  counterparty: string | null;
  amount: Money;
  createdAt: Date;
}

/** The largest transaction of a wallet, signed: positive means money came in. */
export interface TopTransactionRow {
  counterparty: string;
  amount: Money;
}

export interface TopUserRow {
  username: string;
  transactedValue: Money;
}

/** Filters a ledger listing can be narrowed by. Every field is optional. */
export interface LedgerFilters {
  type?: TransactionType;
  direction?: Direction;
  /** Substring of the counterparty username, case-insensitive. */
  q?: string;
  /** Inclusive lower bound on the entry timestamp. */
  from?: Date;
  /** Exclusive upper bound: the start of the day after the requested `to`. */
  to?: Date;
}

export interface LedgerPageArgs {
  userId: number;
  filters: LedgerFilters;
  page: number;
  perPage: number;
}

export interface LedgerTotals {
  creditTotal: Money;
  debitTotal: Money;
  net: Money;
}

/** A raw `numeric` column arrives as a Decimal with the pg driver adapter, but never assume it. */
type RawNumeric = string | number | Prisma.Decimal;

/**
 * Ledger data access.
 *
 * Reads are scoped to one wallet and shaped from *that wallet's* point of view: the counterparty is
 * the other side of the entry and the direction says which way the money moved for the viewer. Both
 * are decided here, never in a controller.
 *
 * The two ranking queries are raw SQL because they need an aggregate ordering (`ABS(amount)`,
 * `SUM(amount)`) combined with a LIMIT — sorting that in JavaScript would mean reading every
 * transaction a wallet ever had just to return ten rows.
 */
@Injectable()
export class TransactionRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Append an immutable ledger entry. Always called inside the transaction that moves the money. */
  create(
    input: { type: TransactionType; fromUserId: number | null; toUserId: number; amount: Money },
    db: Db = this.prisma,
  ): Promise<Transaction> {
    return db.transaction.create({ data: input });
  }

  /** Newest first, with `id` as the tiebreaker so paging can neither skip nor repeat a row. */
  async findPageForUser(
    { userId, filters, page, perPage }: LedgerPageArgs,
    db: Db = this.prisma,
  ): Promise<LedgerRow[]> {
    const rows = await db.transaction.findMany({
      where: this.buildWhere(userId, filters),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        type: true,
        amount: true,
        createdAt: true,
        fromUserId: true,
        toUserId: true,
        fromUser: { select: { username: true } },
        toUser: { select: { username: true } },
      },
    });

    return rows.map((row) =>
      row.toUserId === userId
        ? {
            id: row.id,
            type: row.type,
            direction: 'credit' as const,
            // A topup has no sender, so its counterparty is null as well.
            counterparty: row.fromUser?.username ?? null,
            amount: row.amount,
            createdAt: row.createdAt,
          }
        : {
            id: row.id,
            type: row.type,
            direction: 'debit' as const,
            counterparty: row.toUser.username,
            amount: row.amount,
            createdAt: row.createdAt,
          },
    );
  }

  countForUser(
    { userId, filters }: Omit<LedgerPageArgs, 'page' | 'perPage'>,
    db: Db = this.prisma,
  ): Promise<number> {
    return db.transaction.count({ where: this.buildWhere(userId, filters) });
  }

  /**
   * Totals for the whole filtered set (not just the visible page), so the dashboard's summary does
   * not change while the user pages through.
   */
  async summariseForUser(
    { userId, filters }: Omit<LedgerPageArgs, 'page' | 'perPage'>,
    db: Db = this.prisma,
  ): Promise<LedgerTotals> {
    const where = this.buildWhere(userId, filters);
    const [credit, debit] = await Promise.all([
      db.transaction.aggregate({ _sum: { amount: true }, where: { AND: [where, { toUserId: userId }] } }),
      db.transaction.aggregate({ _sum: { amount: true }, where: { AND: [where, { fromUserId: userId }] } }),
    ]);

    const creditTotal = new Prisma.Decimal(credit._sum.amount ?? 0);
    const debitTotal = new Prisma.Decimal(debit._sum.amount ?? 0);
    return { creditTotal, debitTotal, net: creditTotal.minus(debitTotal) };
  }

  /**
   * The wallet's largest transfers by value, biggest first, signed from its own point of view.
   * Topups are excluded: they have no counterparty to list.
   */
  async findTopByValueForUser(userId: number, limit: number, db: Db = this.prisma): Promise<TopTransactionRow[]> {
    const rows = await db.$queryRaw<
      { counterparty: string; amount: RawNumeric }[]
    >`
      SELECT CASE WHEN t.to_user_id = ${userId} THEN sender.username ELSE recipient.username END AS counterparty,
             CASE WHEN t.to_user_id = ${userId} THEN t.amount ELSE -t.amount END AS amount
      FROM transactions t
      LEFT JOIN users sender ON sender.id = t.from_user_id
      JOIN users recipient ON recipient.id = t.to_user_id
      WHERE t.type = 'transfer' AND (t.from_user_id = ${userId} OR t.to_user_id = ${userId})
      ORDER BY ABS(t.amount) DESC, t.id DESC
      LIMIT ${limit}
    `;

    return rows.map((row) => ({ counterparty: row.counterparty, amount: new Prisma.Decimal(row.amount) }));
  }

  /**
   * Users ranked by the total value they sent, highest first.
   * Receivers do not appear, and a topup has no sender, so both are excluded by the join.
   */
  async findTopUsersByTransactedValue(limit: number, db: Db = this.prisma): Promise<TopUserRow[]> {
    const rows = await db.$queryRaw<{ username: string; transacted_value: RawNumeric }[]>`
      SELECT u.username, SUM(t.amount) AS transacted_value
      FROM transactions t
      JOIN users u ON u.id = t.from_user_id
      WHERE t.type = 'transfer'
      GROUP BY u.id, u.username
      ORDER BY transacted_value DESC, u.username ASC
      LIMIT ${limit}
    `;

    return rows.map((row) => ({ username: row.username, transactedValue: new Prisma.Decimal(row.transacted_value) }));
  }

  /**
   * The one predicate shared by page, count and summary.
   *
   * Building it once is what keeps the three in step: a filter can never apply to the rows but not to
   * the totals.
   *
   * `q` matches the counterparty only. It is expressed as "the *other* side of an entry the viewer is
   * part of", which is why a topup (no sender) can never match a search and why the viewer's own
   * username is never what is being searched for.
   */
  private buildWhere(userId: number, filters: LedgerFilters): Prisma.TransactionWhereInput {
    const conditions: Prisma.TransactionWhereInput[] = [
      { OR: [{ fromUserId: userId }, { toUserId: userId }] },
    ];

    if (filters.type) conditions.push({ type: filters.type });
    if (filters.direction === 'credit') conditions.push({ toUserId: userId });
    if (filters.direction === 'debit') conditions.push({ fromUserId: userId });
    if (filters.q) {
      const username = { contains: filters.q, mode: 'insensitive' as const };
      conditions.push({
        OR: [
          { toUserId: userId, fromUser: { username } },
          { fromUserId: userId, toUser: { username } },
        ],
      });
    }
    if (filters.from || filters.to) {
      conditions.push({
        createdAt: {
          ...(filters.from ? { gte: filters.from } : {}),
          ...(filters.to ? { lt: filters.to } : {}),
        },
      });
    }

    return { AND: conditions };
  }
}
