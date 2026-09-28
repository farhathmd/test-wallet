import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Password hashing.
 *
 * Uses scrypt from Node's standard library: a memory-hard KDF built into the runtime (no bcrypt /
 * argon2 native dependency to compile), and every hash gets its own random salt. The stored format
 * is `scrypt$<salt hex>$<derived key hex>`, so the parameters travel with the hash and can be
 * upgraded later without a data migration.
 *
 * The promisified variant is used on purpose: hashing takes tens of milliseconds and must not block
 * the event loop while other requests are being served.
 */
const SCHEME = 'scrypt';
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

const scrypt = promisify(scryptCallback);

/**
 * Hash used when the username does not exist, so an "unknown user" login costs exactly as much as a
 * "wrong password" login and cannot be told apart by response time. All-zero key: never matches.
 */
const DECOY_HASH = `${SCHEME}$${'00'.repeat(SALT_BYTES)}$${'00'.repeat(KEY_LENGTH)}`;

/**
 * @param {{ keyLength?: number, saltBytes?: number }} [options]
 */
export function createPasswordService({ keyLength = KEY_LENGTH, saltBytes = SALT_BYTES } = {}) {
  return {
    /**
     * @param {string} password
     * @returns {Promise<string>} encoded hash, safe to store
     */
    async hash(password) {
      const salt = randomBytes(saltBytes);
      const derived = await scrypt(password, salt, keyLength);
      return `${SCHEME}$${salt.toString('hex')}$${derived.toString('hex')}`;
    },

    /**
     * Constant-time verification. Never throws on a malformed or missing stored hash: it falls back
     * to the decoy, so an account without a password costs the same as a wrong password.
     *
     * @param {string} password
     * @param {string|null|undefined} storedHash
     * @returns {Promise<boolean>}
     */
    async verify(password, storedHash) {
      const parsed = parseHash(typeof storedHash === 'string' ? storedHash : '') ?? DECOY;
      const derived = await scrypt(password, parsed.salt, parsed.expected.length);
      return timingSafeEqual(parsed.expected, derived);
    },
  };
}

/**
 * @param {string} storedHash
 * @returns {{ salt: Buffer, expected: Buffer }|null}
 */
function parseHash(storedHash) {
  const [scheme, saltHex, keyHex] = storedHash.split('$');
  if (scheme !== SCHEME || !saltHex || !keyHex) return null;
  if (!/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(keyHex)) return null;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(keyHex, 'hex');
  if (salt.length === 0 || expected.length === 0) return null;
  return { salt, expected };
}

const DECOY = parseHash(DECOY_HASH);
