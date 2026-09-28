import { ValidationError } from '../../domain/errors';
import { parseLoginBody, parseRegisterBody } from './auth.dto';
import { parseTopupBody, parseTransferBody } from './wallet.dto';
import { parseLimitQuery, parseTransactionListQuery } from './reporting.dto';

/**
 * The DTO parsers are the boundary where untrusted input becomes something the services can trust.
 * Every rejection is asserted together with its code, because a 400 with a readable message is part of
 * the API contract — a 500 or a silently coerced value is not.
 */
function expectInvalid(fn: () => unknown, pattern?: RegExp): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).status).toBe(400);
    expect((error as ValidationError).code).toBe('VALIDATION_ERROR');
    if (pattern) expect((error as ValidationError).message).toMatch(pattern);
    return;
  }
  throw new Error('Expected a ValidationError, but nothing was thrown.');
}

describe('http/dto', () => {
  describe('parseRegisterBody', () => {
    it('normalises the username and treats the password as optional', () => {
      expect(parseRegisterBody({ username: '  Alice ' })).toEqual({ username: 'alice', password: null });
      expect(parseRegisterBody({ username: 'alice', password: 'passw0rd!' })).toEqual({
        username: 'alice',
        password: 'passw0rd!',
      });
    });

    it('rejects a missing username, an invalid username and a short password', () => {
      expectInvalid(() => parseRegisterBody({}), /"username" is required/);
      expectInvalid(() => parseRegisterBody({ username: 'ab' }), /between 3 and 32/);
      expectInvalid(() => parseRegisterBody({ username: 'alice', password: 'short' }), /between 8 and 128/);
    });

    it('rejects bodies that are not JSON objects', () => {
      for (const body of [undefined, null, [], 'username=alice']) {
        expectInvalid(() => parseRegisterBody(body), /must be a JSON object/);
      }
    });
  });

  describe('parseLoginBody', () => {
    it('requires both username and password', () => {
      expect(parseLoginBody({ username: 'Admin', password: 'passw0rd!' })).toEqual({
        username: 'admin',
        password: 'passw0rd!',
      });
      expectInvalid(() => parseLoginBody({ username: 'admin' }), /"password" is required/);
      expectInvalid(() => parseLoginBody({ password: 'passw0rd!' }), /"username" is required/);
    });
  });

  describe('parseTopupBody / parseTransferBody', () => {
    it('requires an amount, leaving the range and precision rules to the domain layer', () => {
      expect(parseTopupBody({ amount: 10 })).toEqual({ amount: 10 });
      // A present but out-of-range amount is deliberately passed through: domain/money.ts owns the
      // bounds, so the rule exists in exactly one place.
      expect(parseTopupBody({ amount: 0 })).toEqual({ amount: 0 });
      expectInvalid(() => parseTopupBody({}), /"amount" is required/);
      expectInvalid(() => parseTopupBody({ amount: undefined }), /"amount" is required/);
    });

    it('normalises the transfer recipient and requires it', () => {
      expect(parseTransferBody({ to_username: '  BOB ', amount: 5 })).toEqual({
        toUsername: 'bob',
        amount: 5,
      });
      expectInvalid(() => parseTransferBody({ amount: 5 }), /"to_username" is required/);
      expectInvalid(() => parseTransferBody({ to_username: 'x!', amount: 5 }), /_username/);
    });
  });

  describe('parseLimitQuery', () => {
    it('defaults to the documented top 10', () => {
      expect(parseLimitQuery({})).toEqual({ limit: 10 });
      expect(parseLimitQuery(undefined)).toEqual({ limit: 10 });
      expect(parseLimitQuery({ limit: '' })).toEqual({ limit: 10 });
    });

    it('accepts a numeric limit within bounds and rejects everything else', () => {
      expect(parseLimitQuery({ limit: '5' })).toEqual({ limit: 5 });
      expect(parseLimitQuery({ limit: '50' })).toEqual({ limit: 50 });
      for (const limit of ['0', '-1', '51', 'abc', '2.5']) {
        expectInvalid(() => parseLimitQuery({ limit }), /"limit" must be an integer/);
      }
    });
  });

  describe('parseTransactionListQuery', () => {
    it('applies the documented defaults', () => {
      const query = parseTransactionListQuery({});

      expect(query.page).toBe(1);
      expect(query.perPage).toBe(10);
      expect(query.username).toBeUndefined();
      expect(query.filters).toEqual({
        type: undefined,
        direction: undefined,
        q: undefined,
        from: undefined,
        to: undefined,
      });
    });

    it('parses paging and the admin username escape hatch', () => {
      const query = parseTransactionListQuery({ page: '3', per_page: '25', username: 'Bob' });

      expect(query.page).toBe(3);
      expect(query.perPage).toBe(25);
      // Forwarded as written: normalising and authorising it is the service's job.
      expect(query.username).toBe('Bob');
    });

    it('accepts only the supported type and direction values', () => {
      expect(parseTransactionListQuery({ type: 'transfer' }).filters.type).toBe('transfer');
      expect(parseTransactionListQuery({ direction: 'debit' }).filters.direction).toBe('debit');
      expectInvalid(() => parseTransactionListQuery({ type: 'refund' }), /"type" must be one of/);
      expectInvalid(() => parseTransactionListQuery({ direction: 'both' }), /"direction" must be one of/);
    });

    it('trims the search term and bounds its length', () => {
      expect(parseTransactionListQuery({ q: '  bob  ' }).filters.q).toBe('bob');
      expect(parseTransactionListQuery({ q: '   ' }).filters.q).toBeUndefined();
      expectInvalid(() => parseTransactionListQuery({ q: 'x'.repeat(65) }), /"q" must not exceed/);
      expectInvalid(() => parseTransactionListQuery({ q: ['a', 'b'] }), /"q" must be a string/);
    });

    it('turns an inclusive end date into the exclusive upper bound a range query needs', () => {
      const query = parseTransactionListQuery({ from: '2026-01-01', to: '2026-01-31' });

      expect(query.filters.from?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
      expect(query.filters.to?.toISOString()).toBe('2026-02-01T00:00:00.000Z');
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
