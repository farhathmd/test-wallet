import pg from 'pg';

/**
 * Connection pool factory.
 *
 * Postgres hands NUMERIC and BIGINT back as strings to avoid silent precision loss. The values this
 * service stores are far below 2^53 (money: 10,000,000 max at 2 decimals, ids: sequence based), so
 * parsing them into numbers keeps the application code free of string/number juggling while
 * remaining exact. This is configured once, here, instead of in every repository.
 */
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => (value === null ? null : Number(value)));
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => (value === null ? null : Number(value)));

/**
 * @param {{ connectionString: string, max?: number, logger?: Console }} options
 * @returns {pg.Pool}
 */
export function createPool({ connectionString, max = 10, logger = console }) {
  const pool = new pg.Pool({
    connectionString,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: 'crypto-wallet-api',
  });
  // A pool level error means an idle client died (network blip, database restart). Logging it stops
  // the process from crashing on an unhandled 'error' event.
  pool.on('error', (error) => logger.error('[db] idle client error', error));
  return pool;
}
