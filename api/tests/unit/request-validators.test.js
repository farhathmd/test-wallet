import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ValidationError } from '../../src/domain/errors.js';
import {
  parseLimitQuery,
  parseLoginBody,
  parseRegisterBody,
  parseTopupBody,
  parseTransactionListQuery,
  parseTransferBody,
} from '../../src/http/validators/request.js';

/**
 * The validators are the boundary where untrusted input is turned into something the services can
 * trust. Each rejection is asserted with its error code so the API returns a 400 (not a 500) and the
 * client gets a message it can show.
 */
function expectInvalid(fn, pattern) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof ValidationError, `expected ValidationError, got ${error?.name}`);
    assert.equal(error.status, 400);
    assert.equal(error.code, 'VALIDATION_ERROR');
    if (pattern) assert.match(error.message, pattern);
    return true;
  });
}

describe('validators/request', () => {
  describe('parseRegisterBody', () => {
    it('normalises the username and treats the password as optional', () => {
      assert.deepEqual(parseRegisterBody({ username: '  Alice ' }), {
        username: 'alice',
        password: null,
      });
      assert.deepEqual(parseRegisterBody({ username: 'alice', password: 'passw0rd!' }), {
        username: 'alice',
        password: 'passw0rd!',
      });
    });

    it('rejects a missing username, an invalid username and a short password', () => {
      expectInvalid(() => parseRegisterBody({}), /"username" is required/);
      expectInvalid(() => parseRegisterBody({ username: 'ab' }), /between 3 and 32/);
      expectInvalid(
        () => parseRegisterBody({ username: 'alice', password: 'short' }),
        /between 8 and 128/,
      );
    });

    it('rejects bodies that are not JSON objects', () => {
      for (const body of [undefined, null, [], 'username=alice']) {
        expectInvalid(() => parseRegisterBody(body), /must be a JSON object/);
      }
    });
  });

  describe('parseLoginBody', () => {
    it('requires both username and password', () => {
      assert.deepEqual(parseLoginBody({ username: 'Admin', password: 'passw0rd!' }), {
        username: 'admin',
        password: 'passw0rd!',
      });
      expectInvalid(() => parseLoginBody({ username: 'admin' }), /"password" is required/);
      expectInvalid(() => parseLoginBody({ password: 'passw0rd!' }), /"username" is required/);
    });
  });

  describe('parseTopupBody / parseTransferBody', () => {
    it('requires an amount, leaving range and precision rules to the domain layer', () => {
      assert.deepEqual(parseTopupBody({ amount: 10 }), { amount: 10 });
      // A present but out-of-range amount is deliberately passed through: domain/money.js owns the
      // bounds, so the rule exists in exactly one place.
      assert.deepEqual(parseTopupBody({ amount: 0 }), { amount: 0 });
      expectInvalid(() => parseTopupBody({}), /"amount" is required/);
      expectInvalid(() => parseTopupBody({ amount: undefined }), /"amount" is required/);
    });

    it('normalises the transfer recipient and requires it', () => {
      assert.deepEqual(parseTransferBody({ to_username: '  BOB ', amount: 5 }), {
        toUsername: 'bob',
        amount: 5,
      });
      expectInvalid(() => parseTransferBody({ amount: 5 }), /"to_username" is required/);
      expectInvalid(() => parseTransferBody({ to_username: 'x!', amount: 5 }), /_username/);
    });
  });

  describe('parseLimitQuery', () => {
    it('defaults to the documented top 10', () => {
      assert.deepEqual(parseLimitQuery({}), { limit: 10 });
      assert.deepEqual(parseLimitQuery({ limit: '' }), { limit: 10 });
    });

    it('accepts a numeric limit within bounds and rejects everything else', () => {
      assert.deepEqual(parseLimitQuery({ limit: '5' }), { limit: 5 });
      assert.deepEqual(parseLimitQuery({ limit: 50 }), { limit: 50 });
      for (const limit of ['0', '-1', '51', 'abc', '2.5']) {
        expectInvalid(() => parseLimitQuery({ limit }), /"limit" must be an integer/);
      }
    });
  });

  describe('parseTransactionListQuery', () => {
    it('applies the documented defaults', () => {
      const query = parseTransactionListQuery({});

      assert.equal(query.page, 1);
      assert.equal(query.perPage, 10);
      assert.equal(query.username, undefined);
      assert.deepEqual(query.filters, {
        type: undefined,
        direction: undefined,
        q: undefined,
        from: undefined,
        to: undefined,
      });
    });

    it('parses paging and the admin username escape hatch', () => {
      const query = parseTransactionListQuery({ page: '3', per_page: '25', username: 'Bob' });

      assert.equal(query.page, 3);
      assert.equal(query.perPage, 25);
      assert.equal(query.username, 'Bob');
    });

    it('accepts only the supported type and direction values', () => {
      assert.equal(parseTransactionListQuery({ type: 'transfer' }).filters.type, 'transfer');
      assert.equal(parseTransactionListQuery({ direction: 'debit' }).filters.direction, 'debit');
      expectInvalid(() => parseTransactionListQuery({ type: 'refund' }), /"type" must be one of/);
      expectInvalid(() => parseTransactionListQuery({ direction: 'both' }), /"direction" must be one of/);
    });

    it('trims the search term and bounds its length', () => {
      assert.equal(parseTransactionListQuery({ q: '  bob  ' }).filters.q, 'bob');
      assert.equal(parseTransactionListQuery({ q: '   ' }).filters.q, undefined);
      expectInvalid(() => parseTransactionListQuery({ q: 'x'.repeat(65) }), /"q" must not exceed/);
      expectInvalid(() => parseTransactionListQuery({ q: ['a', 'b'] }), /"q" must be a string/);
    });

    it('turns an inclusive end date into the exclusive upper bound a range query needs', () => {
      const query = parseTransactionListQuery({ from: '2026-01-01', to: '2026-01-31' });

      assert.equal(query.filters.from, '2026-01-01T00:00:00.000Z');
      assert.equal(query.filters.to, '2026-02-01T00:00:00.000Z');
    });

    it('rejects malformed, impossible and inverted dates', () => {
      expectInvalid(() => parseTransactionListQuery({ from: '01-01-2026' }), /YYYY-MM-DD/);
      expectInvalid(() => parseTransactionListQuery({ to: '2026-02-30' }), /valid calendar date/);
      expectInvalid(
        () => parseTransactionListQuery({ from: '2026-02-01', to: '2026-01-01' }),
        /must not be later/,
      );
    });

    it('rejects out of range paging', () => {
      expectInvalid(() => parseTransactionListQuery({ page: '0' }), /"page" must be an integer/);
      expectInvalid(() => parseTransactionListQuery({ per_page: '101' }), /"per_page" must be an integer/);
    });
  });
});
