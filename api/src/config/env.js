/**
 * Application configuration.
 *
 * This is the only module allowed to read `process.env`. It fails fast (at import time) when
 * something required is missing or unsafe, so a misconfigured deployment never starts half way.
 * Secrets live here and in `.env` — never inline in the code that uses them.
 */
const DEFAULT_JWT_EXPIRES_IN = '7d';
const MIN_JWT_SECRET_LENGTH = 32;

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string} name
 * @returns {string} trimmed, non-empty value
 */
function requireVariable(env, name) {
  const value = env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value.trim();
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string} name
 * @param {number} fallback
 * @returns {number}
 */
function numberVariable(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer, received "${raw}".`);
  }
  return parsed;
}

/**
 * Build the frozen configuration object consumed by the composition root.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function loadConfig(env = process.env) {
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
    port: numberVariable(env, 'PORT', 4000),
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

/** Lazily loaded singleton for the running server (tests build their own config object). */
let cached;
export function getConfig() {
  cached ??= loadConfig();
  return cached;
}
