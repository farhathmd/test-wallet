import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../../src/bootstrap';
import { APP_CONFIG } from '../../src/config/config.module';
import type { AppConfig } from '../../src/config/configuration';
import { AdminSeeder } from '../../src/modules/auth/admin-seeder.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TEST_DATABASE_URL } from './env';

export { TEST_DATABASE_URL };

/** Truncated between cases; `RESTART IDENTITY` makes ids predictable for assertions. */
const TABLES = 'transactions, users';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  reset: () => Promise<void>;
  seedAdmin: () => Promise<void>;
  /** Raw SQL, for asserting on what actually landed in the database. */
  rows: <Row>(sql: string, ...params: unknown[]) => Promise<Row[]>;
  close: () => Promise<void>;
}

/**
 * Boot the real application on the real test database.
 *
 * No fakes and no mocks: the same `createApp()` the server uses builds this instance, so the guards,
 * the exception filter, the validation pipes and the Prisma wiring under test are exactly the ones
 * that run in production.
 */
export async function createTestContext({ truncate = true } = {}): Promise<TestContext> {
  const app = await createApp();
  await app.init();
  const prisma = app.get(PrismaService);

  const reset = async (): Promise<void> => {
    await prisma.$executeRawUnsafe(`TRUNCATE ${TABLES} RESTART IDENTITY CASCADE`);
  };
  if (truncate) await reset();

  return {
    app,
    prisma,
    reset,
    seedAdmin: () => app.get(AdminSeeder).seed(),
    rows: <Row>(sql: string, ...params: unknown[]) => prisma.$queryRawUnsafe<Row[]>(sql, ...params),
    close: async () => {
      await app.close();
    },
  };
}

/** A supertest agent bound to the running application. */
export function agentFor(app: INestApplication) {
  return request(app.getHttpServer());
}

/**
 * The admin credentials the seeder used, read from the running application's validated configuration.
 *
 * Reading them instead of hardcoding them means the test cannot drift from the source of truth: if the
 * configuration changed the account, the test uses the same values the application did.
 */
export function adminCredentials(app: INestApplication): { username: string; password: string } {
  return app.get<AppConfig>(APP_CONFIG).admin;
}
