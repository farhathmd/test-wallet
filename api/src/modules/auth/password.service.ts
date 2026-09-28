import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const SCHEME = 'scrypt';
/** Defaults: a 64 byte derived key and a 16 byte random salt per password. */
const DEFAULT_KEY_LENGTH = 64;
const DEFAULT_SALT_BYTES = 16;
const HEX = /^[0-9a-f]+$/;

/** Injection token for the cost options. Nothing provides it, so the defaults below apply — it
 *  exists so a test (or a future configuration) can construct the service with cheaper parameters. */
export const PASSWORD_OPTIONS = 'PASSWORD_OPTIONS';

export interface PasswordServiceOptions {
  /** Derived key length in bytes. */
  keyLength?: number;
  /** Salt length in bytes. */
  saltBytes?: number;
}

/**
 * Password hashing with scrypt, from Node's own `crypto` — no third-party dependency.
 *
 * The stored value is self-describing, `scrypt$<salt>$<key>`, and everything needed to verify it
 * travels with it, so the cost parameters can change later without invalidating existing hashes
 * (verification derives a key of the *stored* length, not of the configured one).
 *
 * Two deliberate choices:
 *   * comparison is `timingSafeEqual`, so a wrong password cannot be found byte by byte, and
 *   * `verify` answers `false` instead of throwing for a malformed or missing stored hash, since a
 *     row that lost its password hash must not turn into a 500.
 */
@Injectable()
export class PasswordService {
  private readonly keyLength: number;
  private readonly saltBytes: number;

  constructor(
    // `@Optional()` + a token: Nest injects nothing and the defaults apply, while a test can still
    // construct the service directly with cheaper parameters.
    @Optional() @Inject(PASSWORD_OPTIONS) options: PasswordServiceOptions = {},
  ) {
    this.keyLength = options.keyLength ?? DEFAULT_KEY_LENGTH;
    this.saltBytes = options.saltBytes ?? DEFAULT_SALT_BYTES;
  }

  /** @returns the hash to store, in the form `scrypt$<salt hex>$<key hex>` */
  async hash(password: string): Promise<string> {
    const salt = randomBytes(this.saltBytes);
    const key = await this.deriveKey(password, salt, this.keyLength);
    return `${SCHEME}$${salt.toString('hex')}$${key.toString('hex')}`;
  }

  /** @returns true only when `password` reproduces `stored`; false for anything malformed */
  async verify(password: unknown, stored: string | null | undefined): Promise<boolean> {
    const parsed = parseHash(stored);
    if (!parsed || typeof password !== 'string' || password === '') return false;

    const key = await this.deriveKey(password, parsed.salt, parsed.key.length);
    return key.length === parsed.key.length && timingSafeEqual(key, parsed.key);
  }

  private deriveKey(password: string, salt: Buffer, keyLength: number): Promise<Buffer> {
    return derive(password, salt, keyLength) as Promise<Buffer>;
  }
}

/** Split a stored hash back into its salt and key. Anything unexpected is simply not a hash. */
function parseHash(stored: string | null | undefined): { salt: Buffer; key: Buffer } | null {
  if (typeof stored !== 'string') return null;
  const [scheme, saltHex, keyHex] = stored.split('$');
  if (scheme !== SCHEME || !saltHex || !keyHex) return null;
  if (!HEX.test(saltHex) || !HEX.test(keyHex) || keyHex.length % 2 !== 0) return null;
  return { salt: Buffer.from(saltHex, 'hex'), key: Buffer.from(keyHex, 'hex') };
}
