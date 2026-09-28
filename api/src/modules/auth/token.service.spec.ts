import { JwtService } from '@nestjs/jwt';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { UnauthorizedError } from '../../domain/errors';
import { TokenService } from './token.service';

const SECRET = 'unit-test-secret-that-is-long-enough-01';
const user = { id: 7, username: 'alice', role: 'user' } as const;

/** The token service is a thin, testable wrapper: no Nest module needed to exercise it. */
function createTokenService(options: { secret?: string; expiresIn?: string } = {}): TokenService {
  const expiresIn = (options.expiresIn ?? '1h') as SignOptions['expiresIn'];
  return new TokenService(new JwtService({ secret: options.secret ?? SECRET, signOptions: { expiresIn } }));
}

const tokens = createTokenService();

describe('modules/auth/token.service', () => {
  it('signs a token that carries the user identity', () => {
    const payload = jwt.decode(tokens.sign(user)) as jwt.JwtPayload;

    expect(payload.sub).toBe('7');
    expect(payload.username).toBe('alice');
    expect(payload.role).toBe('user');
    expect(payload.exp).toBeGreaterThan(payload.iat as number);
  });

  it('round-trips a token back to the authenticated user', () => {
    expect(tokens.verify(tokens.sign(user))).toEqual(user);
    expect(tokens.verify(tokens.sign({ ...user, role: 'admin' }))).toEqual({ ...user, role: 'admin' });
  });

  it('rejects a token signed with a different secret', () => {
    const forged = jwt.sign({ username: 'mallory' }, 'another-secret-that-is-long-enough', {
      subject: '99',
    });

    expect(() => tokens.verify(forged)).toThrow(UnauthorizedError);
  });

  it('rejects a tampered token', () => {
    const token = tokens.sign(user);
    const [header, , signature] = token.split('.');
    const tampered = `${header}.${Buffer.from(JSON.stringify({ sub: '1', role: 'admin' })).toString('base64url')}.${signature}`;

    expect(() => tokens.verify(tampered)).toThrow(UnauthorizedError);
    expect(() => tokens.verify(`${token}x`)).toThrow(UnauthorizedError);
  });

  it('rejects an expired token', () => {
    const expired = createTokenService({ expiresIn: '-1s' }).sign(user);

    expect(() => tokens.verify(expired)).toThrow(/Invalid or expired token/);
  });

  it('rejects a token signed with an algorithm we do not accept', () => {
    const other = jwt.sign({ username: 'alice' }, SECRET, { algorithm: 'HS384', subject: '7' });

    expect(() => tokens.verify(other)).toThrow(UnauthorizedError);
  });

  it('rejects malformed, empty and non-string tokens', () => {
    for (const token of ['', 'not-a-token', 'a.b.c', undefined, null, 123, {}]) {
      expect(() => tokens.verify(token)).toThrow(UnauthorizedError);
    }
  });

  it('falls back to the least privileged role for an unexpected role value', () => {
    const weird = jwt.sign({ username: 'alice', role: 'root' }, SECRET, { subject: '7' });

    expect(tokens.verify(weird).role).toBe('user');
  });

  describe('extractFrom', () => {
    it('accepts a Bearer token, a Token prefix and a bare token', () => {
      const token = tokens.sign(user);

      for (const header of [`Bearer ${token}`, `token ${token}`, token, `Bearer   ${token}  `, `  ${token}  `]) {
        expect(tokens.extractFrom(header)).toBe(token);
      }
    });

    it('returns the header unchanged when there is no prefix, including a lone "Bearer"', () => {
      // `Bearer` on its own is then treated as a token and rejected by verify() — no special case here.
      expect(tokens.extractFrom('not-a-token')).toBe('not-a-token');
      expect(tokens.extractFrom('Bearer')).toBe('Bearer');
      expect(() => tokens.verify('Bearer')).toThrow(UnauthorizedError);
    });
  });
});
