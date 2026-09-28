import { UnauthorizedError } from '../domain/errors.js';
import { normalizeUsername } from '../domain/username.js';

/**
 * Registration and login.
 *
 * Registering is open to everyone (it is how a wallet is created); the token returned makes the
 * client immediately usable, matching the API contract of "user details including auth token".
 * Logging in additionally requires a password, which is what the admin dashboard uses.
 */
export function createAuthService({ userRepository, passwordService, jwtService }) {
  return {
    /**
     * @param {{ username: string, password?: string|null }} input
     * @returns {Promise<{ user: object, token: string }>}
     * @throws {import('../domain/errors.js').ConflictError} when the username is taken
     */
    async register({ username, password = null }) {
      const normalized = normalizeUsername(username);
      // Hash first, insert second: hashing happens outside the transaction, so a slow KDF never
      // holds a database connection.
      const passwordHash = password === null ? null : await passwordService.hash(password);

      const user = await userRepository.insert({ username: normalized, passwordHash });
      return { user, token: jwtService.sign(user) };
    },

    /**
     * @param {{ username: string, password: string }} input
     * @returns {Promise<{ user: object, token: string }>}
     * @throws {UnauthorizedError} for unknown usernames, password-less accounts and wrong passwords
     */
    async login({ username, password }) {
      const user = await userRepository.findByUsername(normalizeUsername(username));
      // Verification runs even when the user is unknown (decoy hash), and the branch does not leak
      // which half failed, so neither timing nor the message reveals whether a username exists.
      const passwordMatches = await passwordService.verify(password, user?.passwordHash ?? null);
      if (!user || !passwordMatches) {
        throw new UnauthorizedError('Invalid username or password.');
      }
      return { user, token: jwtService.sign(user) };
    },
  };
}
