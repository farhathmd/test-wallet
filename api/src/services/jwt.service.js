import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../domain/errors.js';

/**
 * JWT issuing and verification — the only module that imports `jsonwebtoken`.
 *
 * Keeping it behind a thin interface means:
 *  * the secret and algorithm are configured in exactly one place, and
 *  * services/tests can swap in a fake token implementation without touching the HTTP layer.
 *
 * Tokens are stateless: verifying costs a signature check and no database round trip, which keeps
 * every authenticated request off the database until it actually needs data. The tradeoff is that a
 * token cannot be revoked before it expires, so `JWT_EXPIRES_IN` is configuration, not a constant
 * (see api/README.md "Authentication").
 */
const ALGORITHM = 'HS256';

/**
 * @param {{ secret: string, expiresIn?: string }} options
 */
export function createJwtService({ secret, expiresIn = '7d' }) {
  if (typeof secret !== 'string' || secret.length === 0) {
    throw new Error('createJwtService requires a secret.');
  }

  return {
    /**
     * @param {{ id: number, username: string, role: string }} user
     * @returns {string} signed token
     */
    sign(user) {
      return jwt.sign({ username: user.username, role: user.role }, secret, {
        algorithm: ALGORITHM,
        subject: String(user.id),
        expiresIn,
      });
    },

    /**
     * @param {string} token
     * @returns {{ id: number, username: string, role: string }}
     * @throws {UnauthorizedError} for expired, tampered, malformed or foreign-signed tokens
     */
    verify(token) {
      if (typeof token !== 'string' || token.length === 0) {
        throw new UnauthorizedError('Authorization token is required.');
      }
      try {
        // The algorithm allow-list is what blocks "alg: none" and algorithm confusion attacks.
        const payload = jwt.verify(token, secret, { algorithms: [ALGORITHM] });
        return {
          id: Number(payload.sub),
          username: String(payload.username),
          role: payload.role === 'admin' ? 'admin' : 'user',
        };
      } catch {
        // Deliberately opaque: never reveal whether a token merely expired or was forged.
        throw new UnauthorizedError('Invalid or expired token.');
      }
    },
  };
}
