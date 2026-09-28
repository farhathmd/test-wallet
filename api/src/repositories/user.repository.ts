import { Injectable } from '@nestjs/common';
import { ConflictError } from '../domain/errors';
import type { Money } from '../domain/money';
import { Prisma } from '../generated/prisma/client';
import type { User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { Db } from './db';

/**
 * User data access.
 *
 * This file contains queries only. Rules that decide *whether* something may happen (is this
 * username taken, is there enough money) live in the services; the two things that cannot be
 * decided outside the database are done here:
 *
 *  * a duplicate username is translated from the Postgres unique violation (23505) into a
 *    `ConflictError`, and
 *  * `lockByIds` takes row locks, which is what makes concurrent transfers safe.
 */
@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: number, db: Db = this.prisma): Promise<User | null> {
    return db.user.findUnique({ where: { id } });
  }

  findByUsername(username: string, db: Db = this.prisma): Promise<User | null> {
    return db.user.findUnique({ where: { username } });
  }

  /**
   * Create a wallet user.
   * @throws {ConflictError} when the username already exists
   */
  async create(input: { username: string; passwordHash: string | null }, db: Db = this.prisma): Promise<User> {
    try {
      return await db.user.create({ data: input });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('Username is already taken.');
      }
      throw error;
    }
  }

  /**
   * Create the admin account, or refresh the credentials of the existing one.
   *
   * A single `upsert` statement, so two replicas booting at the same time cannot both decide to
   * create it. Only credentials are touched: an existing admin keeps its balance and its ledger.
   */
  upsertAdmin(input: { username: string; passwordHash: string }, db: Db = this.prisma): Promise<User> {
    return db.user.upsert({
      where: { username: input.username },
      create: { ...input, role: 'admin' },
      update: { passwordHash: input.passwordHash, role: 'admin' },
    });
  }

  /**
   * Lock the given users for the rest of the transaction, **in ascending id order**.
   *
   * Taking the locks in a deterministic order is what prevents two transfers in opposite directions
   * from deadlocking: whichever transaction starts second waits instead of each holding one row and
   * waiting for the other. Rows that do not exist are simply absent from the result, so callers can
   * report "unknown sender/recipient" from the same check. `$queryRaw` is used because Prisma has no
   * `FOR UPDATE` in its query API.
   */
  async lockByIds(ids: number[], db: Db = this.prisma): Promise<User[]> {
    const unique = [...new Set(ids)].sort((a, b) => a - b);
    if (unique.length === 0) return [];
    const rows = await db.$queryRaw<User[]>`
      SELECT * FROM users WHERE id = ANY(${unique}::int[]) ORDER BY id FOR UPDATE
    `;
    // Raw rows bypass Prisma's type mapping, and the driver may hand a NUMERIC over as a string;
    // normalising here means callers always compare Decimals and never a string.
    return rows.map((row) => ({ ...row, balance: new Prisma.Decimal(row.balance) }));
  }

  /**
   * Apply a signed delta to a balance — the only way a balance changes.
   *
   * `increment` compiles to `SET balance = balance + $delta` inside a single UPDATE, so the delta is
   * applied by the database and never by a read-modify-write in Node. Callers hold the row lock
   * (`lockByIds`) before calling this, and the CHECK constraint on the column is the last line of
   * defence against a negative balance.
   *
   * @param delta positive to credit, negative to debit
   * @returns the updated user, or null when the user does not exist
   */
  async adjustBalance(id: number, delta: Money, db: Db = this.prisma): Promise<User | null> {
    try {
      return await db.user.update({ where: { id }, data: { balance: { increment: delta } } });
    } catch (error) {
      // P2025 = no row matched the where clause, i.e. the user was deleted after it was locked.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') return null;
      throw error;
    }
  }
}
