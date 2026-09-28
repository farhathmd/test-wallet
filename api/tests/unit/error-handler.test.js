import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AppError,
  InsufficientBalanceError,
  ValidationError,
} from '../../src/domain/errors.js';
import { createErrorHandler, notFoundHandler } from '../../src/http/middleware/error-handler.js';

/** Minimal Express response double: records what would have been sent. */
function createResponseDouble() {
  return {
    headersSent: false,
    statusCode: 0,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

const req = { method: 'POST', originalUrl: '/api/v1/topup' };
const silentLogger = { error() {}, info() {}, warn() {} };

describe('http/middleware/error-handler', () => {
  it('translates a domain error into its status, code and message', () => {
    const res = createResponseDouble();
    createErrorHandler({ logger: silentLogger })(
      new InsufficientBalanceError('Insufficient balance.', { balance: 5 }),
      req,
      res,
      () => {},
    );

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, {
      error: {
        code: 'INSUFFICIENT_BALANCE',
        message: 'Insufficient balance.',
        details: { balance: 5 },
      },
    });
  });

  it('maps each AppError status without special casing', () => {
    for (const [error, status] of [
      [new ValidationError('bad input'), 400],
      [new AppError('teapot', { code: 'TEAPOT', status: 418 }), 418],
    ]) {
      const res = createResponseDouble();
      createErrorHandler({ logger: silentLogger })(error, req, res, () => {});
      assert.equal(res.statusCode, status);
      assert.equal(res.body.error.message, error.message);
    }
  });

  it('hides unexpected errors behind a generic 500 and logs them', () => {
    const logged = [];
    const res = createResponseDouble();
    const leaking = new Error('relation "users" does not exist at postgres://user:pw@host');

    createErrorHandler({ logger: { error: (...args) => logged.push(args) } })(leaking, req, res, () => {});

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, {
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
    });
    assert.ok(!JSON.stringify(res.body).includes('postgres://'));
    assert.equal(logged.length, 1);
    assert.ok(logged[0].includes(leaking));
  });

  it('reports malformed JSON and oversized payloads as client errors', () => {
    for (const [type, status] of [
      ['entity.parse.failed', 400],
      ['entity.too.large', 413],
    ]) {
      const res = createResponseDouble();
      const error = Object.assign(new Error('body parser'), { type });
      createErrorHandler({ logger: silentLogger })(error, req, res, () => {});
      assert.equal(res.statusCode, status);
    }
  });

  it('defers to Express when the response has already started', () => {
    const res = createResponseDouble();
    res.headersSent = true;
    let forwarded = null;

    createErrorHandler({ logger: silentLogger })(new Error('too late'), req, res, (error) => {
      forwarded = error;
    });

    assert.equal(forwarded.message, 'too late');
    assert.equal(res.body, undefined);
  });

  it('answers unknown routes with the standard error shape', () => {
    const res = createResponseDouble();

    notFoundHandler({ method: 'GET', originalUrl: '/api/v1/nope' }, res);

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, {
      error: { code: 'NOT_FOUND', message: 'Route GET /api/v1/nope does not exist.' },
    });
  });
});
