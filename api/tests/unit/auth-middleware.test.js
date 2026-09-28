import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenError, UnauthorizedError } from '../../src/domain/errors.js';
import { createAuthMiddleware } from '../../src/http/middleware/auth.js';
import { createJwtService } from '../../src/services/jwt.service.js';

const jwtService = createJwtService({ secret: 'unit-test-secret-that-is-long-enough-01' });
const { authenticate, requireRole } = createAuthMiddleware({ jwtService });

const userToken = jwtService.sign({ id: 1, username: 'alice', role: 'user' });
const adminToken = jwtService.sign({ id: 2, username: 'admin', role: 'admin' });

/** Runs the middleware with a fake Authorization header and reports the outcome. */
function run(header, middleware = authenticate) {
  const req = {
    get: (name) =>
      name.toLowerCase() === 'authorization' ? header : undefined,
  };
  let forwarded;
  let calledNext = false;
  middleware(req, {}, (error) => {
    forwarded = error;
    calledNext = !error;
  });
  return { req, forwarded, calledNext };
}

describe('http/middleware/auth', () => {
  it('accepts a Bearer token and attaches the authenticated user', () => {
    const { req, calledNext } = run(`Bearer ${userToken}`);

    assert.equal(calledNext, true);
    assert.deepEqual(req.user, { id: 1, username: 'alice', role: 'user' });
  });

  it('accepts a bare token, a "Token" prefix and extra spacing', () => {
    for (const header of [userToken, `token ${userToken}`, `Bearer   ${userToken}  `, `  ${userToken}  `]) {
      const { req, calledNext } = run(header);
      assert.equal(calledNext, true, `header "${header.slice(0, 12)}..." should be accepted`);
      assert.equal(req.user.id, 1);
    }
  });

  it('rejects a missing, empty or malformed Authorization header', () => {
    for (const header of [undefined, '', '   ', 'Bearer', 'Bearer ', 'not-a-token']) {
      const { forwarded, calledNext } = run(header);
      assert.equal(calledNext, false, `header "${header}" should be rejected`);
      assert.ok(forwarded instanceof UnauthorizedError);
      assert.equal(forwarded.status, 401);
    }
  });

  it('rejects a token signed for a different secret', () => {
    const foreign = createJwtService({ secret: 'a-completely-different-secret-0123456789' });
    const { forwarded } = run(foreign.sign({ id: 9, username: 'mallory', role: 'admin' }));

    assert.ok(forwarded instanceof UnauthorizedError);
  });

  it('grants roles only to the matching user', () => {
    const adminRequest = run(`Bearer ${adminToken}`);
    let adminNext = false;
    requireRole('admin')(adminRequest.req, {}, () => {
      adminNext = true;
    });
    assert.equal(adminNext, true);

    const userRequest = run(`Bearer ${userToken}`);
    let forwarded;
    requireRole('admin')(userRequest.req, {}, (error) => {
      forwarded = error;
    });
    assert.ok(forwarded instanceof ForbiddenError);
    assert.equal(forwarded.status, 403);
  });

  it('treats a missing user as the least privileged role check failure', () => {
    let forwarded;
    requireRole('admin')({}, {}, (error) => {
      forwarded = error;
    });

    assert.ok(forwarded instanceof ForbiddenError);
  });
});
