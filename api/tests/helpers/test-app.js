import pg from 'pg';
import { createApp } from '../../src/app.js';
import { createContainer } from '../../src/container.js';
import { runMigrations } from '../../src/db/migrate.js';
import { createPool } from '../../src/db/pool.js';

/**
 * Integration test harness: a real Express app on a real PostgreSQL database.
 *
 * What it does for every test file:
 *   * creates the test database if it does not exist (so CI only needs a running server),
 *   * applies the same migrations the production API applies,
 *   * starts from empty tables, and
 *   * builds the application through the real composition root — no fakes, no mocks.
 *
 * Configuration comes from TEST_DATABASE_URL, defaulting to a local `wallet_test` database. Unit
 * tests never touch this file, so `npm test` still runs with no database at all.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/wallet_test';
export const TEST_JWT_SECRET = 'integration-test-secret-that-is-long-enough';
export const ADMIN_CREDENTIALS = { username: 'admin', password: 'admin12345' };

const silentLogger = { info() {}, warn() {}, error() {} };
const TABLES = 'transactions, users';

/** @param {string} connectionString */
function databaseName(connectionString) {
  return new URL(connectionString).pathname.replace(/^\//, '');
}

/** Connect to the maintenance database to create the test database when it is missing. */
async function ensureDatabaseExists(connectionString) {
  const maintenanceUrl = new URL(connectionString);
  maintenanceUrl.pathname = '/postgres';
  const client = new pg.Client({ connectionString: maintenanceUrl.toString() });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      `Cannot reach PostgreSQL at ${maintenanceUrl.host} (${error.message}).\n` +
        'Integration tests need a database. Start one with:\n' +
        '  brew services start postgresql@16        # or: docker compose up -d db\n' +
        'then re-run: npm run test:integration',
      { cause: error },
    );
  }
  try {
    const name = databaseName(connectionString);
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (rowCount === 0) {
      await client.query(`CREATE DATABASE "${name}"`);
    }
  } finally {
    await client.end();
  }
}

/** @param {object} [overrides] */
export function createTestConfig(overrides = {}) {
  return {
    nodeEnv: 'test',
    isProduction: false,
    port: 0,
    databaseUrl: TEST_DATABASE_URL,
    dbPoolMax: 10,
    jwt: { secret: TEST_JWT_SECRET, expiresIn: '1h' },
    corsOrigin: '*',
    admin: ADMIN_CREDENTIALS,
    ...overrides,
  };
}

/**
 * Boot the API against the test database.
 * @param {{ truncate?: boolean, config?: object }} [options]
 */
export async function createTestContext({ truncate = true, config = createTestConfig() } = {}) {
  await ensureDatabaseExists(config.databaseUrl);
  const pool = createPool({
    connectionString: config.databaseUrl,
    max: config.dbPoolMax,
    logger: silentLogger,
  });
  await runMigrations(pool, { logger: silentLogger });
  if (truncate) await pool.query(`TRUNCATE ${TABLES} RESTART IDENTITY CASCADE`);

  const container = createContainer({ config, pool });
  const app = createApp({
    config,
    controllers: container.controllers,
    middleware: container.middleware,
    logger: silentLogger,
  });

  return {
    app,
    pool,
    config,
    services: container.services,
    jwtService: container.jwtService,
    passwordService: container.passwordService,
    /** Empty the tables between cases without restarting the app. */
    reset: () => pool.query(`TRUNCATE ${TABLES} RESTART IDENTITY CASCADE`),
    /** Direct SQL access, for asserting on what actually landed in the database. */
    query: (text, params) => pool.query(text, params),
    close: () => pool.end(),
  };
}
