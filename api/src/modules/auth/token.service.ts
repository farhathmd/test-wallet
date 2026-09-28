import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthenticatedUser, Role } from '../../common/types';
import { UnauthorizedError } from '../../domain/errors';

/**
 * JWT issuing and verification — the only place that touches jsonwebtoken (through @nestjs/jwt).
 *
 * Tokens are stateless: verifying costs a signature check and no database round trip, which keeps
 * every authenticated request off the database until it actually needs data. The tradeoff is that a
 * token cannot be revoked before it expires, so `JWT_EXPIRES_IN` is configuration, not a constant
 * (see README "Authentication").
 */
@Injectable()
export class TokenService {
  constructor(private readonly jwtService: JwtService) {}

  /**
   * @param user the freshly registered or logged in user
   * @returns a signed token identifying that user
   */
  sign(user: { id: number; username: string; role: Role }): string {
    return this.jwtService.sign(
      { username: user.username, role: user.role },
      { subject: String(user.id) },
    );
  }

  /**
   * @throws {UnauthorizedError} for expired, tampered, malformed or foreign-signed tokens
   */
  verify(token: unknown): AuthenticatedUser {
    if (typeof token !== 'string' || token.length === 0) {
      throw new UnauthorizedError('Authorization token is required.');
    }
    try {
      // The algorithm allow-list is what blocks "alg: none" and algorithm confusion attacks.
      const payload = this.jwtService.verify<{ username?: unknown; role?: unknown; sub?: unknown }>(
        token,
        { algorithms: ['HS256'] },
      );
      return {
        id: Number(payload.sub),
        username: String(payload.username),
        role: payload.role === 'admin' ? 'admin' : 'user',
      };
    } catch {
      // Deliberately opaque: never reveal whether a token merely expired or was forged.
      throw new UnauthorizedError('Invalid or expired token.');
    }
  }

  /**
   * Pull the token out of an `Authorization` header.
   *
   * The header is accepted as `Bearer <token>`, `Token <token>` and as a bare token, because the API
   * documentation only says "User token" for that header and all three conventions occur in the wild.
   */
  extractFrom(header: string | undefined): string | null {
    if (typeof header !== 'string') return null;
    const trimmed = header.trim();
    if (trimmed === '') return null;
    const match = /^(?:bearer|token)\s+(.+)$/i.exec(trimmed);
    return (match ? match[1] : trimmed).trim() || null;
  }
}
