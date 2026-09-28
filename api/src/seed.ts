import { Logger } from '@nestjs/common';
import { createApp } from './bootstrap';
import { AdminSeeder } from './modules/auth/admin-seeder.service';

/**
 * `npm run seed` — create or refresh the admin account and exit.
 *
 * The same seeder runs on boot (see `startServer`); this entry point exists so a deployment can bring
 * the account in sync without starting a server.
 */
async function main(): Promise<void> {
  const app = await createApp();
  try {
    await app.get(AdminSeeder).seed();
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  Logger.error(
    error instanceof Error ? error.message : String(error),
    error instanceof Error ? error.stack : undefined,
    'Seed',
  );
  process.exitCode = 1;
});
