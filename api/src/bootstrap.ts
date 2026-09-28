import { INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { APP_CONFIG } from './config/config.module';
import type { AppConfig } from './config/configuration';
import { AdminSeeder } from './modules/auth/admin-seeder.service';

/** Documented body ceiling: 16 kB, which is far more than any request this API accepts. */
const BODY_LIMIT = '16kb';
/** Every route lives under one versioned prefix, so versioning is a routing decision, not a rename. */
const GLOBAL_PREFIX = 'api/v1';

/**
 * Build the HTTP application without starting it.
 *
 * Separate from `startServer` so tests can exercise the real app (real config, real guards, real
 * filters) through supertest without binding a port, and so `npm run seed` can reuse it without
 * listening at all.
 */
export async function createApp(): Promise<INestApplication> {
  // Nest's own body parser is off: the JSON parser is registered below with the documented limit,
  // which is the only way to pin it (the Nest default is 100 kB and not configurable through options).
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = app.get<AppConfig>(APP_CONFIG);

  // Headers first, so every response — including an error — carries them.
  app.use(helmet());
  app.enableCors({ origin: parseCorsOrigins(config.corsOrigin) });
  app.use(json({ limit: BODY_LIMIT }));

  app.setGlobalPrefix(GLOBAL_PREFIX);
  app.useGlobalFilters(new AllExceptionsFilter());
  // Lets SIGTERM/SIGINT run onModuleDestroy, which drains the pg pool instead of cutting it off.
  app.enableShutdownHooks();

  return app;
}

/**
 * Boot the application: make sure the admin account exists, then listen.
 *
 * Seeding is a no-op when the account is already correct, so it is safe on every start — a fresh
 * deployment needs no manual step, and a changed ADMIN_PASSWORD takes effect on restart.
 */
export async function startServer(): Promise<INestApplication> {
  const logger = new Logger('Bootstrap');
  const app = await createApp();
  const config = app.get<AppConfig>(APP_CONFIG);

  await app.get(AdminSeeder).seed();
  await app.listen(config.port);
  logger.log(`API listening on http://localhost:${config.port}/${GLOBAL_PREFIX}`);

  return app;
}

/**
 * `CORS_ORIGIN` is documented as a comma separated list, with `*` meaning "any origin".
 * @returns what `enableCors` expects: one origin, a list of them, or `*`
 */
function parseCorsOrigins(value: string): string | string[] {
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '');
  return origins.length === 1 ? origins[0] : origins;
}
