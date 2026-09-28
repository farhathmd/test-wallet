/**
 * Test environment constants, deliberately free of application imports: `global-setup.ts` runs before
 * the application graph is loadable, so it must be able to read the connection string without pulling
 * in Prisma, Nest or the generated client.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/wallet_test';
