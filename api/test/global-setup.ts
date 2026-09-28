import { execFileSync } from 'node:child_process';
import { Client } from 'pg';
import { TEST_DATABASE_URL } from './helpers/env';

/**
 * Prepares the test database once, before any suite runs.
 *
 * Integration tests need a real PostgreSQL server, so this:
 *   * creates the test database when it does not exist (a fresh machine then only needs Postgres), and
 *   * applies the *same* Prisma migrations the production API applies — the schema under test is the
 *     schema that ships, so a migration bug fails here rather than in production.
 *
 * The failure message names the usual fix, because "connect ECONNREFUSED" on its own tells a new
 * developer nothing about what to start.
 */
export default async function globalSetup(): Promise<void> {
  await ensureDatabaseExists();
  applyMigrations();
}

async function ensureDatabaseExists(): Promise<void> {
  const maintenanceUrl = new URL(TEST_DATABASE_URL);
  const name = maintenanceUrl.pathname.replace(/^\//, '');
  maintenanceUrl.pathname = '/postgres';

  const client = new Client({ connectionString: maintenanceUrl.toString() });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      `Cannot reach PostgreSQL at ${maintenanceUrl.host} (${(error as Error).message}).\n` +
        'Integration tests need a database. Start one with:\n' +
        '  brew services start postgresql@16        # or: docker compose up -d db\n' +
        'then re-run: npm run test:integration',
      { cause: error },
    );
  }

  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (rowCount === 0) {
      await client.query(`CREATE DATABASE "${name}"`);
    }
  } finally {
    await client.end();
  }
}

function applyMigrations(): void {
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'ignore',
  });
}
