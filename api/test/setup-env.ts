/**
 * Environment for the integration suite, applied before any application module is imported.
 *
 * Jest sets `NODE_ENV=test` itself, and `AppConfigModule` refuses to read a `.env` file in that mode —
 * so a developer's `.env` can never leak into a test run. Everything the validated configuration
 * requires is therefore provided here, pointed at the test database.
 *
 * `DATABASE_URL` deliberately wins over whatever the shell had: an integration run must never touch the
 * database the developer uses for the dashboard. `TEST_DATABASE_URL` may come from `.env`
 * (`npm run test:integration` loads it) or default to a local `wallet_test`.
 */
const DEFAULT_TEST_DATABASE_URL = 'postgres://localhost:5432/wallet_test';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
process.env.JWT_SECRET ??= 'integration-test-secret-that-is-long-enough';
process.env.JWT_EXPIRES_IN ??= '1h';
process.env.ADMIN_USERNAME ??= 'admin';
process.env.ADMIN_PASSWORD ??= 'admin12345';
process.env.DB_POOL_MAX ??= '10';
// A concrete origin, not `*`: `test/cors.e2e-spec.ts` asserts that an unlisted origin receives no
// CORS header, which is only observable — and only meaningful — with a real allow-list. Matches the
// default in `configuration.ts`.
process.env.CORS_ORIGIN ??= 'http://localhost:5173';
