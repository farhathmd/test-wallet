import { ConflictError, UnauthorizedError } from '../../domain/errors';
import { UserRepository } from '../../repositories/user.repository';
import { createInMemoryWallet } from '../../testing/fake-repositories';
import { AuthService } from './auth.service';
import { PasswordService, PasswordServiceOptions } from './password.service';
import { TokenService } from './token.service';
import { JwtService } from '@nestjs/jwt';

const SECRET = 'unit-test-secret-that-is-long-enough-01';

/** Cheap scrypt parameters: these tests are about behaviour, not about hashing cost. */
const FAST_HASHING: PasswordServiceOptions = { keyLength: 16, saltBytes: 8 };

/**
 * Await a promise that is expected to reject, and hand back the error.
 *
 * The auth service answers with a session on success, so asserting on the failure path means narrowing
 * the union — this keeps that narrowing in one place instead of a cast per assertion.
 */
async function rejection(promise: Promise<unknown>): Promise<UnauthorizedError> {
  try {
    await promise;
  } catch (error) {
    return error as UnauthorizedError;
  }
  throw new Error('Expected a rejection, but the promise resolved.');
}

/**
 * Builds the auth service on top of an in-memory wallet: no database involved, and the token service
 * is the real one so a returned token can be verified in the assertion.
 */
function createTestAuth({
  users = [],
  passwords = new PasswordService(FAST_HASHING),
}: {
  users?: { username: string; role?: 'user' | 'admin'; passwordHash?: string | null; balance?: number }[];
  passwords?: PasswordService;
} = {}) {
  const wallet = createInMemoryWallet({ users });
  const tokens = new TokenService(new JwtService({ secret: SECRET, signOptions: { expiresIn: '1h' } }));
  const auth = new AuthService(
    wallet.userRepository as unknown as UserRepository,
    passwords,
    tokens,
  );
  return { auth, wallet, tokens, passwords };
}

describe('modules/auth/auth.service', () => {
  describe('register', () => {
    it('creates the user, returns a usable token and normalises the username', async () => {
      const { auth, tokens, wallet } = createTestAuth();

      const { user, token } = await auth.register({ username: '  Alice ', password: 'passw0rd!' });

      expect(user.username).toBe('alice');
      expect(user.role).toBe('user');
      expect(Number(user.balance)).toBe(0);
      expect(tokens.verify(token)).toEqual({ id: user.id, username: 'alice', role: 'user' });
      expect((await wallet.userRepository.findByUsername('alice'))?.id).toBe(user.id);
    });

    it('stores a hash, never the password itself', async () => {
      const { auth, wallet } = createTestAuth();

      const { user } = await auth.register({ username: 'bob', password: 'passw0rd!' });

      expect(user.passwordHash).not.toBe('passw0rd!');
      expect(user.passwordHash?.startsWith('scrypt$')).toBe(true);
      expect((await wallet.userRepository.findById(user.id))?.passwordHash).toBe(user.passwordHash);
    });

    it('supports wallet-only accounts registered without a password (the documented contract)', async () => {
      const { auth, tokens } = createTestAuth();

      const { user, token } = await auth.register({ username: 'charlie' });

      expect(user.passwordHash).toBeNull();
      expect(tokens.verify(token).id).toBe(user.id);
    });

    it('rejects a username that is already taken, in any casing', async () => {
      const { auth } = createTestAuth({ users: [{ username: 'alice' }] });

      await expect(auth.register({ username: 'ALICE' })).rejects.toThrow(ConflictError);
      await expect(auth.register({ username: 'alice' })).rejects.toThrow(/Username is already taken/);
    });
  });

  describe('login', () => {
    it('returns a token for the right password', async () => {
      const { auth, tokens } = createTestAuth();
      await auth.register({ username: 'alice', password: 'passw0rd!' });

      const { user, token } = await auth.login({ username: 'alice', password: 'passw0rd!' });

      expect(user.username).toBe('alice');
      expect(tokens.verify(token).username).toBe('alice');
    });

    it('accepts a differently cased username', async () => {
      const { auth } = createTestAuth();
      await auth.register({ username: 'alice', password: 'passw0rd!' });

      const { user } = await auth.login({ username: 'AlIcE', password: 'passw0rd!' });

      expect(user.username).toBe('alice');
    });

    it('rejects a wrong password', async () => {
      const { auth } = createTestAuth();
      await auth.register({ username: 'alice', password: 'passw0rd!' });

      await expect(auth.login({ username: 'alice', password: 'w0rdpass!' })).rejects.toThrow(UnauthorizedError);
    });

    it('reports the same error for an unknown user, leaking no account existence', async () => {
      const unknown = await rejection(
        createTestAuth().auth.login({ username: 'nobody', password: 'passw0rd!' }),
      );
      const withAccount = createTestAuth({ users: [{ username: 'alice' }] });
      const wrongPassword = await rejection(
        withAccount.auth.login({ username: 'alice', password: 'passw0rd!' }),
      );

      expect(unknown.status).toBe(401);
      expect(unknown.code).toBe(wrongPassword.code);
      expect(unknown.message).toBe(wrongPassword.message);
    });

    it('rejects login on a wallet-only account', async () => {
      const { auth } = createTestAuth();
      await auth.register({ username: 'charlie' });

      await expect(auth.login({ username: 'charlie', password: 'anything123' })).rejects.toThrow(
        UnauthorizedError,
      );
    });

    it('issues an admin token for an admin account (what the dashboard uses)', async () => {
      const passwords = new PasswordService(FAST_HASHING);
      const passwordHash = await passwords.hash('passw0rd!');
      const { auth, tokens } = createTestAuth({
        users: [{ username: 'admin', role: 'admin', passwordHash, balance: 0 }],
        passwords,
      });

      const { token } = await auth.login({ username: 'admin', password: 'passw0rd!' });

      expect(tokens.verify(token)).toEqual({ id: 1, username: 'admin', role: 'admin' });
    });
  });
});
