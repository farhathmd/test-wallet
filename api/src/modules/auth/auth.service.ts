import { Injectable } from '@nestjs/common';
import { UnauthorizedError } from '../../domain/errors';
import type { User } from '../../generated/prisma/client';
import { normalizeUsername } from '../../domain/username';
import { UserRepository } from '../../repositories/user.repository';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

/** What /register and /login answer: the account plus the token to use from then on. */
export interface AuthenticatedSession {
  user: User;
  token: string;
}

/** One message for every failed login, so the response cannot be used to probe for usernames. */
const INVALID_CREDENTIALS = 'Invalid username or password.';

/**
 * A hash of a value nobody can guess, used as the stand-in when the account does not exist.
 *
 * It can never match, but verifying it still costs one scrypt derivation — the same work a real
 * account would cost — so "no such user" and "wrong password" are indistinguishable by timing too.
 */
const DECOY_HASH = `scrypt$${'00'.repeat(16)}$${'00'.repeat(64)}`;

/**
 * Use cases for "prove who you are": register a wallet and exchange credentials for a token.
 *
 * The service only orchestrates; the rules live in `domain/` (username, password, money) and the
 * queries in `repositories/`, which is why this file has no SQL and no HTTP in it.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  /**
   * Create a wallet and hand back a token for it.
   *
   * A password is optional (a wallet-only account), and the username is normalised here as well as in
   * the request parser: this way `Alice` and `alice` are one account even for a caller that is not
   * HTTP, and the rule lives in `domain/username.ts` rather than in a database index.
   *
   * @throws {ConflictError} when the username is taken
   */
  async register(input: { username: string; password?: string | null }): Promise<AuthenticatedSession> {
    const username = normalizeUsername(input.username);
    const passwordHash = input.password ? await this.passwords.hash(input.password) : null;
    const user = await this.users.create({ username, passwordHash });
    return { user, token: this.tokens.sign(user) };
  }

  /**
   * Exchange credentials for a token.
   *
   * An unknown user, a wrong password and a password-less account all fail exactly the same way —
   * same code, same message, same work — so this endpoint cannot be used to enumerate accounts.
   * @throws {UnauthorizedError}
   */
  async login(input: { username: string; password: string }): Promise<AuthenticatedSession> {
    const user = await this.users.findByUsername(normalizeUsername(input.username));
    const stored = user?.passwordHash ?? DECOY_HASH;
    const matches = await this.passwords.verify(input.password, stored);

    if (!user || !user.passwordHash || !matches) {
      throw new UnauthorizedError(INVALID_CREDENTIALS);
    }
    return { user, token: this.tokens.sign(user) };
  }
}
