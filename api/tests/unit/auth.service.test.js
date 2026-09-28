import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConflictError, UnauthorizedError } from '../../src/domain/errors.js';
import { createAuthService } from '../../src/services/auth.service.js';
import { createJwtService } from '../../src/services/jwt.service.js';
import { createPasswordService } from '../../src/services/password.service.js';
import { createInMemoryWallet } from '../helpers/fake-repositories.js';

const SECRET = 'unit-test-secret-that-is-long-enough-01';

/** Builds the auth service on top of an in-memory wallet: no database involved. */
function createTestAuth({
  users = [],
  passwordService = createPasswordService({ keyLength: 16, saltBytes: 8 }),
} = {}) {
  const wallet = createInMemoryWallet({ users });
  const jwtService = createJwtService({ secret: SECRET, expiresIn: '1h' });
  const authService = createAuthService({
    userRepository: wallet.userRepository,
    passwordService,
    jwtService,
  });
  return { authService, jwtService, wallet, passwordService };
}

describe('services/auth.service', () => {
  describe('register', () => {
    it('creates the user, returns a usable token and normalises the username', async () => {
      const { authService, jwtService, wallet } = createTestAuth();

      const { user, token } = await authService.register({
        username: '  Alice ',
        password: 'passw0rd!',
      });

      assert.equal(user.username, 'alice');
      assert.equal(user.role, 'user');
      assert.equal(user.balance, 0);
      assert.deepEqual(jwtService.verify(token), { id: user.id, username: 'alice', role: 'user' });
      assert.equal((await wallet.userRepository.findByUsername('alice')).id, user.id);
    });

    it('stores a hash, never the password itself', async () => {
      const { authService, wallet } = createTestAuth();

      const { user } = await authService.register({ username: 'bob', password: 'passw0rd!' });

      assert.notEqual(user.passwordHash, 'passw0rd!');
      assert.ok(user.passwordHash.startsWith('scrypt$'));
      assert.equal((await wallet.userRepository.findById(user.id)).passwordHash, user.passwordHash);
    });

    it('supports wallet-only accounts registered without a password (the documented contract)', async () => {
      const { authService, jwtService } = createTestAuth();

      const { user, token } = await authService.register({ username: 'charlie' });

      assert.equal(user.passwordHash, null);
      assert.equal(jwtService.verify(token).id, user.id);
    });

    it('rejects a username that is already taken, in any casing', async () => {
      const { authService } = createTestAuth({ users: [{ username: 'alice' }] });

      await assert.rejects(() => authService.register({ username: 'ALICE' }), ConflictError);
      await assert.rejects(
        () => authService.register({ username: 'alice' }),
        /Username is already taken/,
      );
    });
  });

  describe('login', () => {
    it('returns a token for the right password', async () => {
      const { authService, jwtService } = createTestAuth();
      await authService.register({ username: 'alice', password: 'passw0rd!' });

      const { user, token } = await authService.login({ username: 'alice', password: 'passw0rd!' });

      assert.equal(user.username, 'alice');
      assert.equal(jwtService.verify(token).username, 'alice');
    });

    it('accepts a differently cased username', async () => {
      const { authService } = createTestAuth();
      await authService.register({ username: 'alice', password: 'passw0rd!' });

      const { user } = await authService.login({ username: 'AlIcE', password: 'passw0rd!' });

      assert.equal(user.username, 'alice');
    });

    it('rejects a wrong password', async () => {
      const { authService } = createTestAuth();
      await authService.register({ username: 'alice', password: 'passw0rd!' });

      await assert.rejects(
        () => authService.login({ username: 'alice', password: 'w0rdpass!' }),
        UnauthorizedError,
      );
    });

    it('reports the same error for an unknown user, leaking no account existence', async () => {
      const unknown = await createTestAuth()
        .authService.login({ username: 'nobody', password: 'passw0rd!' })
        .catch((error) => error);
      const withAccount = createTestAuth({ users: [{ username: 'alice' }] });
      const wrongPassword = await withAccount.authService
        .login({ username: 'alice', password: 'passw0rd!' })
        .catch((error) => error);

      assert.equal(unknown.status, 401);
      assert.equal(unknown.code, wrongPassword.code);
      assert.equal(unknown.message, wrongPassword.message);
    });

    it('rejects login on a wallet-only account', async () => {
      const { authService } = createTestAuth();
      await authService.register({ username: 'charlie' });

      await assert.rejects(
        () => authService.login({ username: 'charlie', password: 'anything123' }),
        UnauthorizedError,
      );
    });

    it('issues an admin token for an admin account (what the dashboard uses)', async () => {
      const passwordService = createPasswordService({ keyLength: 16, saltBytes: 8 });
      const passwordHash = await passwordService.hash('passw0rd!');
      const { authService, jwtService } = createTestAuth({
        users: [{ username: 'admin', role: 'admin', passwordHash, balance: 0 }],
        passwordService,
      });

      const { token } = await authService.login({ username: 'admin', password: 'passw0rd!' });

      assert.deepEqual(jwtService.verify(token), { id: 1, username: 'admin', role: 'admin' });
    });
  });
});
