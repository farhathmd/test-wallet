/**
 * Unit of work: runs a business operation inside a single database transaction.
 *
 * The callback receives a fresh set of repositories bound to the transaction client, so a service
 * can write to several tables atomically without ever touching `pg` directly:
 *
 *   await unitOfWork.run(async ({ users, transactions }) => { ... });
 *
 * Concurrency: transactions run at Postgres' default READ COMMITTED isolation and take explicit
 * row locks (`SELECT ... FOR UPDATE`, see user.repository) before mutating balances, which is
 * sufficient for wallet correctness without paying for SERIALIZABLE retries.
 *
 * @param {import('pg').Pool} pool
 * @param {(client: import('pg').PoolClient) => object} createRepositories
 */
export function createUnitOfWork(pool, createRepositories) {
  return {
    /**
     * @template T
     * @param {(repositories: object) => Promise<T>} work
     * @returns {Promise<T>}
     */
    async run(work) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await work(createRepositories(client));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // The connection is already unusable; releasing it below is the best we can do.
        }
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
