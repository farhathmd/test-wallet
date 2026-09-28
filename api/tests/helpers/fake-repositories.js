import { ConflictError } from '../../src/domain/errors.js';

/**
 * In-memory doubles for the repository ports.
 *
 * Unit tests must not need a database (they should run in milliseconds on any machine), so the
 * services are exercised against these instead. They implement the same contracts as
 * src/repositories/*, including the two rules the services rely on:
 *   * `insert` throws ConflictError on a duplicate username, and
 *   * `adjustBalance` returns null instead of allowing a negative balance.
 */

/**
 * A wallet store with users, a ledger and a passthrough unit of work.
 * @param {{ users?: Array<{ username: string, balance?: number, passwordHash?: string|null, role?: string }> }} [options]
 */
export function createInMemoryWallet({ users = [] } = {}) {
  const usersById = new Map();
  const transactions = [];
  let nextUserId = 1;
  let nextTransactionId = 1;

  for (const user of users) {
    const id = nextUserId++;
    usersById.set(id, {
      id,
      role: 'user',
      balance: 0,
      passwordHash: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      ...user,
    });
  }

  const findByUsername = (username) =>
    [...usersById.values()].find((user) => user.username === username) ?? null;

  const userRepository = {
    async insert({ username, passwordHash = null }) {
      if (findByUsername(username)) throw new ConflictError('Username is already taken.');
      const user = {
        id: nextUserId++,
        username,
        role: 'user',
        balance: 0,
        passwordHash,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      };
      usersById.set(user.id, user);
      return { ...user };
    },

    async findByUsername(username) {
      const user = findByUsername(username);
      return user ? { ...user } : null;
    },

    async findById(id) {
      const user = usersById.get(id);
      return user ? { ...user } : null;
    },

    async lockByIds(ids) {
      return [...new Set(ids)]
        .sort((a, b) => a - b)
        .map((id) => usersById.get(id))
        .filter(Boolean)
        .map((user) => ({ ...user }));
    },

    async adjustBalance(id, signedAmount) {
      const user = usersById.get(id);
      if (!user) return null;
      const deltaCents = Math.round(Number(signedAmount) * 100);
      const balanceCents = Math.round(user.balance * 100) + deltaCents;
      if (balanceCents < 0) return null;
      user.balance = balanceCents / 100;
      return { ...user };
    },
  };

  const transactionRepository = {
    async insert({ type, fromUserId = null, toUserId, amount }) {
      const row = {
        id: nextTransactionId++,
        type,
        fromUserId,
        toUserId,
        amount: Number(amount),
        createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      };
      transactions.push(row);
      return row;
    },
  };

  return {
    userRepository,
    transactionRepository,
    /** The real unit of work adds BEGIN/COMMIT; for fakes the callback just runs. */
    unitOfWork: { async run(work) { return work({ users: userRepository, transactions: transactionRepository }); } },
    ledger: () => transactions.map((row) => ({ ...row })),
    balanceOf: (id) => usersById.get(id)?.balance ?? null,
    addUser: async (user) => userRepository.insert(user),
  };
}

/**
 * Canned reporting repository.
 *
 * The reporting service is a mapping/authorisation layer, so its tests only need to control what the
 * repository returns and to observe which arguments it was called with.
 *
 * @param {{ topTransactions?: object[], topUsers?: object[], page?: object[], total?: number, summary?: object }} [options]
 */
export function createFakeReportingRepository({
  topTransactions = [],
  topUsers = [],
  page = [],
  total = 0,
  summary = { creditTotal: 0, debitTotal: 0 },
} = {}) {
  const calls = { top: [], users: [], page: [], count: [], summary: [] };
  return {
    calls,
    async findTopByValueForUser(userId, limit) {
      calls.top.push({ userId, limit });
      return topTransactions;
    },
    async findTopUsersByTransactedValue(limit) {
      calls.users.push({ limit });
      return topUsers;
    },
    async findPageForUser(args) {
      calls.page.push(args);
      return page;
    },
    async countForUser(args) {
      calls.count.push(args);
      return total;
    },
    async summariseForUser(args) {
      calls.summary.push(args);
      return summary;
    },
  };
}
