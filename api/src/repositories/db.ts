import type { Prisma } from '../generated/prisma/client';

/**
 * The Prisma client as seen from inside a transaction.
 *
 * Repositories accept one of these so a caller can pass either the shared client or the transaction
 * handle it is currently inside (`prisma.$transaction(...)`), which is how the wallet service keeps a
 * balance change, its ledger row and its locks atomic. `PrismaClient` satisfies this type too.
 */
export type Db = Prisma.TransactionClient;
