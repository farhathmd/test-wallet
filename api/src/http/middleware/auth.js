import { ForbiddenError, UnauthorizedError } from '../../domain/errors.js';

/**
 * Authentication middleware.
 *
 * Accepts the token both as `Authorization: Bearer <token>` and as a bare `Authorization: <token>`,
 * because the API documentation only says "User token" for that header and the two conventions are
 * both common in the wild. Anything that does not verify as a well formed, unexpired token signed by
 * us becomes a 401.
 *
 * Verification is purely cryptographic: no database round trip, so this adds effectively zero
 * latency to every authenticated request.
 *
 * @param {{ jwtService: { verify: (token: string) => object } }} dependencies
 */
export function createAuthMiddleware({ jwtService }) {
  /**
   * @param {string|undefined} header
   * @returns {string|null}
   */
  function extractToken(header) {
    if (typeof header !== 'string') return null;
    const trimmed = header.trim();
    if (trimmed === '') return null;
    const match = /^(?:bearer|token)\s+(.+)$/i.exec(trimmed);
    return (match ? match[1] : trimmed).trim() || null;
  }

  /** Express middleware: attaches `req.user` or forwards a 401. */
  function authenticate(req, _res, next) {
    const token = extractToken(req.get('authorization'));
    if (!token) {
      next(new UnauthorizedError('Authorization token is required.'));
      return;
    }
    try {
      req.user = jwtService.verify(token);
      next();
    } catch (error) {
      next(error);
    }
  }

  /**
   * Guard a route behind a role. Must run after `authenticate`.
   * @param {'admin'|'user'} role
   */
  function requireRole(role) {
    return (req, _res, next) => {
      if (req.user?.role !== role) {
        next(new ForbiddenError(`This action requires the "${role}" role.`));
        return;
      }
      next();
    };
  }

  return { authenticate, requireRole, extractToken };
}
