import { pathToFileURL } from 'node:url';
import { createApp } from './app.js';
import { createPool } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { seedAdmin } from './db/seed-admin.js';
import { createContainer } from './container.js';
import { getConfig } from './config/env.js';

/**
 * Process entry point.
 *
 * Boot order matters: validate configuration (throws with a readable message), connect, migrate,
 * make sure the admin account exists, then listen. Container orchestrators need signals handled:
 * SIGTERM stops accepting connections, drains in-flight requests and closes the pool.
 *
 * @param {{ config?: object, logger?: Console }} [options]
 */
export async function startServer({ config = getConfig(), logger = console } = {}) {
  const pool = createPool({
    connectionString: config.databaseUrl,
    max: config.dbPoolMax,
    logger,
  });

  await runMigrations(pool, { logger });
  const container = createContainer({ config, pool });
  await seedAdmin({ pool, admin: config.admin, passwordService: container.passwordService, logger });

  const app = createApp({
    config,
    controllers: container.controllers,
    middleware: container.middleware,
    logger,
  });

  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(config.port);
    listener.once('listening', () => resolve(listener));
    listener.once('error', reject);
  });
  logger.info(`[api] listening on http://localhost:${config.port}/api/v1 (${config.nodeEnv})`);

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`[api] ${signal} received, shutting down.`);
    await new Promise((resolve) => server.close(resolve));
    await pool.end().catch(() => {});
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  return { server, pool, app, config };
}

// Only start when executed directly (`node src/server.js`), never when imported by a test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch((error) => {
    console.error(`[api] failed to start: ${error.message}`);
    process.exitCode = 1;
  });
}

