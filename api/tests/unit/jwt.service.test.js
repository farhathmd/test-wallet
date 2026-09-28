import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../../src/domain/errors.js';
import { createJwtService } from '../../src/services/jwt.service.js';

const SECRET = 'unit-test-secret-that-is-long-enough-01';
const user = { id: 7, username: 'alice', role: 'user' };
const jwtService = createJwtService({ secret: SECRET, expiresIn: '1h' });

describe('services/jwt.service', () => {
  it('signs a token that carries the user identity', () => {
    const payload = jwt.decode(jwtService.sign(user));
    assert.equal(payload.sub, '7');
    assert.equal(payload.username, 'alice');
    assert.equal(payload.role, 'user');
    assert.ok(payload.exp > payload.iat);
  });

  it('round-trips a token back to the authenticated user', () => {
    assert.deepEqual(jwtService.verify(jwtService.sign(user)), user);
    assert.deepEqual(jwtService.verify(jwtService.sign({ ...user, role: 'admin' })), {
      ...user,
      role: 'admin',
    });
  });

  it('rejects a token signed with a different secret', () => {
    const forged = jwt.sign({ username: 'mallory' }, 'another-secret-that-is-long-enough', {
      subject: '99',
    });
    assert.throws(() => jwtService.verify(forged), UnauthorizedError);
  });

  it('rejects a tampered token', () => {
    const token = jwtService.sign(user);
    const [header, payload, signature] = token.split('.');
    const tampered = `${header}.${Buffer.from(JSON.stringify({ sub: '1', role: 'admin' })).toString('base64url')}.${signature}`;
    assert.throws(() => jwtService.verify(tampered), UnauthorizedError);
    assert.throws(() => jwtService.verify(`${token}x`), UnauthorizedError);
  });

  it('rejects an expired token', () => {
    const expired = createJwtService({ secret: SECRET, expiresIn: '-1s' }).sign(user);
    assert.throws(() => jwtService.verify(expired), /Invalid or expired token/);
  });

  it('rejects tokens signed with an algorithm we do not accept', () => {
    const other = jwt.sign({ username: 'alice' }, SECRET, { algorithm: 'HS384', subject: '7' });
    assert.throws(() => jwtService.verify(other), UnauthorizedError);
  });

  it('rejects malformed, empty and non-string tokens', () => {
    for (const token of ['', 'not-a-token', 'a.b.c', undefined, null, 123]) {
      assert.throws(() => jwtService.verify(token), UnauthorizedError);
    }
  });

  it('falls back to the least privileged role for unexpected role values', () => {
    const weird = jwt.sign({ username: 'alice', role: 'root' }, SECRET, { subject: '7' });
    assert.equal(jwtService.verify(weird).role, 'user');
  });

  it('requires a secret', () => {
    assert.throws(() => createJwtService({ secret: '' }), /secret/);
  });
});
