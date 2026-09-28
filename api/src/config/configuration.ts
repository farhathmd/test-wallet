/**
 * Application configuration.
 *
 * This is the only module allowed to read `process.env`. It fails fast when something required is
 * missing or unsafe, so a misconfigured deployment never starts half way. Secrets live in `.env`
 * (loaded by @nestjs/config, see config.module.ts) — never inline in the code that uses them.
 *
 * The validated, frozen object is exposed to the rest of the app as the `APP_CONFIG` provider, so no
 * service has to reach for `process.env` or repeat a default value.
 */
const DEFAULT_JWT_EXPIRES_IN = '7d';
const DEFAULT_PORT = 4000;
const MIN_JWT_SECRET_LENGTH = 32;

export interface AppConfig {
  readonly nodeEnv: string;
  readonly isProduction: boolean;
  readonly port: number;
  readonly databaseUrl: string;
  readonly dbPoolMax: number;
  readonly jwt: { readonly secret: string; readonly expiresIn: string };
  readonly corsOrigin: string;
  readonly admin: { readonly username: string; readonly password: string };
}

function requireVariable(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value.trim();
}

function numberVariable(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer, received "${raw}".`);
  }
  return parsed;
}

/** True when the process runs under Jest — used to keep tests off the developer's `.env`. */
export function isTestEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === 'test';
}

/**
 * Build the frozen configuration object consumed by the composition root.
 * @throws {Error} when a required variable is missing or a value is unsafe
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = (env.NODE_ENV ?? 'development').trim();
  const jwtSecret = requireVariable(env, 'JWT_SECRET');
  if (jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters. Generate one with: openssl rand -hex 32`,
    );
  }

  return Object.freeze({
    nodeEnv,
    isProduction: nodeEnv === 'production',
    port: numberVariable(env, 'PORT', DEFAULT_PORT),
    databaseUrl: requireVariable(env, 'DATABASE_URL'),
    dbPoolMax: numberVariable(env, 'DB_POOL_MAX', 10),
    jwt: Object.freeze({
      secret: jwtSecret,
      expiresIn: (env.JWT_EXPIRES_IN ?? DEFAULT_JWT_EXPIRES_IN).trim(),
    }),
    corsOrigin: (env.CORS_ORIGIN ?? 'http://localhost:5173').trim(),
    admin: Object.freeze({
      username: requireVariable(env, 'ADMIN_USERNAME'),
      password: requireVariable(env, 'ADMIN_PASSWORD'),
    }),
  });
}
