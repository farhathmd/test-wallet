import { ConflictError } from '../domain/errors';
import type { Direction, TransactionType } from '../domain/ledger';
import { Prisma } from '../generated/prisma/client';
import type { Db } from '../repositories/db';

/**
 * In-memory doubles for the repository ports.
 *
 * Unit tests must not need a database (they run in milliseconds on any machine), so the services are
 * exercised against these instead. They behave like `src/repositories/*` in the two ways the services
 * rely on: `create` answers a duplicate username with a `ConflictError`, `adjustBalance` refuses to
 * make a balance negative, and `lockByIds` hands back balances as decimals — the same type the real
 * `SELECT ... FOR UPDATE` returns after normalisation.
 */
export interface FakeUser {
  id: number;
  username: string;
  role: 'user' | 'admin';
  balance: number;
  passwordHash: string | null;
  createdAt: Date;
}

export interface FakeTransactionRow {
  id: number;
  type: 'topup' | 'transfer';
  fromUserId: number | null;
  toUserId: number;
  amount: number;
  createdAt: string;
}

/** Fixed clock, so a test can assert on timestamps instead of ignoring them. */
const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z');
const CENTS = 100;

/** A wallet store with users, a ledger and a pass-through unit of work. */
export function createInMemoryWallet({ users = [] }: { users?: Partial<FakeUser>[] } = {}) {
  const usersById = new Map<number, FakeUser>();
  const transactions: FakeTransactionRow[] = [];
  let nextUserId = 1;
  let nextTransactionId = 1;

  for (const user of users) {
    const id = nextUserId++;
    usersById.set(id, {
      id,
      username: '',
      role: 'user',
      balance: 0,
      passwordHash: null,
      createdAt: FIXED_NOW,
      ...user,
    });
  }

  const findUserByUsername = (username: string): FakeUser | null =>
    [...usersById.values()].find((user) => user.username === username) ?? null;

  const toCents = (amount: number | Prisma.Decimal | string): number => Math.round(Number(amount) * CENTS);

  const userRepository = {
    async create({ username, passwordHash = null }: { username: string; passwordHash?: string | null }) {
      if (findUserByUsername(username)) throw new ConflictError('Username is already taken.');
      const id = nextUserId++;
      const user: FakeUser = {
        id,
        username,
        role: 'user',
        balance: 0,
        passwordHash,
        createdAt: FIXED_NOW,
      };
      usersById.set(id, user);
      return { ...user };
    },

    async upsertAdmin({ username, passwordHash }: { username: string; passwordHash: string }) {
      const existing = findUserByUsername(username);
      const user: FakeUser = existing
        ? { ...existing, passwordHash, role: 'admin' }
        : { id: nextUserId++, username, role: 'admin', balance: 0, passwordHash, createdAt: FIXED_NOW };
      usersById.set(user.id, user);
      return { ...user };
    },

    async findByUsername(username: string) {
      const user = findUserByUsername(username);
      return user ? { ...user } : null;
    },

    async findById(id: number) {
      const user = usersById.get(id);
      return user ? { ...user } : null;
    },

    async lockByIds(ids: number[]) {
      return [...new Set(ids)]
        .sort((a, b) => a - b)
        .map((id) => usersById.get(id))
        .filter((user): user is FakeUser => user !== undefined)
        .map((user) => ({ ...user, balance: new Prisma.Decimal(user.balance) }));
    },

    async adjustBalance(id: number, delta: Prisma.Decimal) {
      const user = usersById.get(id);
      if (!user) return null;
      const balanceCents = toCents(user.balance) + toCents(delta);
      if (balanceCents < 0) return null;
      user.balance = balanceCents / CENTS;
      return { ...user, balance: new Prisma.Decimal(user.balance) };
    },
  };

  const transactionRepository = {
    async create({
      type,
      fromUserId = null,
      toUserId,
      amount,
    }: {
      type: 'topup' | 'transfer';
      fromUserId?: number | null;
      toUserId: number;
      amount: Prisma.Decimal;
    }) {
      const row: FakeTransactionRow = {
        id: nextTransactionId++,
        type,
        fromUserId,
        toUserId,
        amount: Number(amount),
        createdAt: FIXED_NOW.toISOString(),
      };
      transactions.push(row);
      return row;
    },
  };

  return {
    userRepository,
    transactionRepository,
    /** The real unit of work opens a transaction; for fakes the callback just runs. */
    unitOfWork: {
      async run<Result>(work: (db: Db) => Promise<Result>): Promise<Result> {
        return work({} as Db);
      },
    },
    ledger: (): FakeTransactionRow[] => transactions.map((row) => ({ ...row })),
    balanceOf: (id: number): number | null => usersById.get(id)?.balance ?? null,
  };
}

/** A canned ledger page row, as the reporting repository would return it. */
export interface FakeLedgerRow {
  id: number;
  type: TransactionType;
  direction: Direction;
  counterparty: string | null;
  amount: number;
  createdAt: Date | string;
}

export interface FakeReportingOptions {
  topTransactions?: { counterparty: string; amount: number }[];
  topUsers?: { username: string; transactedValue: number }[];
  page?: FakeLedgerRow[];
  total?: number;
  summary?: { creditTotal: Prisma.Decimal | number; debitTotal: Prisma.Decimal | number };
}

/**
 * Canned reporting repository.
 *
 * The reporting service is a mapping and authorisation layer, so its tests only need to control what
 * the repository returns and to observe the arguments it was called with.
 */
export function createFakeReportingRepository({
  topTransactions = [],
  topUsers = [],
  page = [],
  total = 0,
  summary = { creditTotal: 0, debitTotal: 0 },
}: FakeReportingOptions = {}) {
  const calls = {
    top: [] as { userId: number; limit?: number }[],
    users: [] as { limit?: number }[],
    page: [] as unknown[],
    count: [] as unknown[],
    summary: [] as unknown[],
  };

  return {
    calls,
    async findTopByValueForUser(userId: number, limit?: number) {
      calls.top.push({ userId, limit });
      return topTransactions;
    },
    async findTopUsersByTransactedValue(limit?: number) {
      calls.users.push({ limit });
      return topUsers;
    },
    async findPageForUser(args: unknown) {
      calls.page.push(args);
      return page;
    },
    async countForUser(args: unknown) {
      calls.count.push(args);
      return total;
    },
    async summariseForUser(args: unknown) {
      calls.summary.push(args);
      return summary;
    },
  };
}
