import { pathToFileURL } from 'node:url';
import { normalizeUsername } from '../domain/username.js';
import { createPasswordService } from '../services/password.service.js';

/**
 * Idempotent admin bootstrap.
 *
 * The dashboard requires a username + password login, while regular wallet users may register with
 * a username only. This creates (or refreshes) that privileged account from environment variables
 * on every boot, so a fresh database is immediately usable:
 *   - first run  -> INSERT
 *   - later runs -> UPDATE the password hash / role
 *
 * @param {{ pool: import('pg').Pool, admin: { username: string, password: string }, passwordService: object, logger?: Console }} deps
 * @returns {Promise<{ id: number, username: string }>}
 */
export async function seedAdmin({ pool, admin, passwordService, logger = console }) {
  const username = normalizeUsername(admin.username, 'ADMIN_USERNAME');
  const passwordHash = await passwordService.hash(admin.password);

  const { rows } = await pool.query(
    `
      INSERT INTO users (username, password_hash, role)
      VALUES ($1, $2, 'admin')
      ON CONFLICT (username) DO UPDATE
        SET password_hash = EXCLUDED.password_hash,
            role          = 'admin',
            updated_at    = now()
      RETURNING id, username
    `,
    [username, passwordHash],
  );
  logger.info(`[db] admin account ready: ${rows[0].username}`);
  return rows[0];
}

/* c8 ignore start — CLI wiring, exercised by running `npm run seed`. */
async function main() {
  const [{ getConfig }, { createPool }] = await Promise.all([
    import('../config/env.js'),
    import('./pool.js'),
  ]);
  const config = getConfig();
  const pool = createPool({ connectionString: config.databaseUrl, max: 1 });
  try {
    await seedAdmin({ pool, admin: config.admin, passwordService: createPasswordService() });
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
