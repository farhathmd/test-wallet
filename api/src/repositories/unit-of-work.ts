import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Db } from './db';

/**
 * How long a request may wait for a pooled connection (`maxWait`) and how long a transaction may run
 * (`timeout`).
 *
 * Prisma's defaults are 2 s and 5 s. The wait is the one that matters: a burst of parallel transfers
 * legitimately queues behind itself on the connection pool, and a 2 s ceiling turns that queue into a
 * 500 instead of a slightly slower answer. The run budget stays tight on purpose — a transfer is a
 * handful of short statements, so anything slower is holding a row lock on something stuck, and
 * rolling back is the right answer.
 */
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 10_000 } as const;

/**
 * Transaction boundary.
 *
 * Services depend on this port instead of on Prisma directly, so "these statements belong together"
 * is expressed in the business logic while the mechanism (BEGIN/COMMIT, waiting, timeouts) stays in
 * one place. The callback receives the transaction-scoped handle that repositories accept.
 */
@Injectable()
export class UnitOfWork {
  constructor(private readonly prisma: PrismaService) {}

  run<Result>(work: (db: Db) => Promise<Result>): Promise<Result> {
    return this.prisma.$transaction(work, TRANSACTION_OPTIONS);
  }
}
