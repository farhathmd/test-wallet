import { readdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

/**
 * Minimal forward-only SQL migration runner.
 *
 * Why not a migration library? The whole requirement is "apply the .sql files in order, once,
 * tracked in a table" — 60 lines of code, no dependency, and the SQL stays visible in the repo.
 * Applied migrations are recorded in `schema_migrations`; each file runs inside its own
 * transaction, so a failing migration leaves the schema untouched.
 */
const MIGRATIONS_DIR = new URL('./migrations/', import.meta.url);
/** Arbitrary constant: serialises concurrent boots so two API replicas cannot migrate at once. */
const MIGRATION_LOCK_KEY = 74_621_001;

/**
 * @param {import('pg').Pool} pool
 * @param {{ logger?: Console }} [options]
 * @returns {Promise<string[]>} names of the migrations applied by this call (may be empty)
 */
export async function runMigrations(pool, { logger = console } = {}) {
  const client = await pool.connect();
  const applied = [];
  try {
    // Held until the connection is released; blocks a second migrator instead of racing it.
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith('.sql')).sort();
    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const done = new Set(rows.map((row) => row.name));

    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(new URL(file, MIGRATIONS_DIR), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${error.message}`, { cause: error });
      }
      applied.push(file);
      logger.info(`[db] applied migration ${file}`);
    }
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => {});
    client.release();
  }
}

/* c8 ignore start — CLI wiring, exercised by running `npm run migrate`. */
async function main() {
  const [{ getConfig }, { createPool }] = await Promise.all([
    import('../config/env.js'),
    import('./pool.js'),
  ]);
  const config = getConfig();
  const pool = createPool({ connectionString: config.databaseUrl, max: 1 });
  try {
    const applied = await runMigrations(pool);
    console.info(
      applied.length > 0
        ? `[db] ${applied.length} migration(s) applied.`
        : '[db] database is already up to date.',
    );
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
/* c8 ignore stop */
