import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ValidationError } from '../../src/domain/errors.js';
import { PASSWORD_MAX_LENGTH, validatePassword } from '../../src/domain/password.js';
import { normalizeUsername } from '../../src/domain/username.js';

describe('domain/username', () => {
  it('normalises to lower case and trims', () => {
    assert.equal(normalizeUsername('  Alice '), 'alice');
    assert.equal(normalizeUsername('ADMIN'), 'admin');
  });

  it('keeps usernames that only differ in case identical, so uniqueness is case-insensitive', () => {
    assert.equal(normalizeUsername('Alice'), normalizeUsername('alice'));
  });

  it('accepts the documented character set', () => {
    for (const value of ['abc', 'user_1', 'first.last', 'with-dash', 'a'.repeat(32)]) {
      assert.equal(normalizeUsername(value), value);
    }
  });

  it('rejects usernames that are too short or too long', () => {
    assert.throws(() => normalizeUsername('ab'), /between 3 and 32/);
    assert.throws(() => normalizeUsername('a'.repeat(33)), ValidationError);
  });

  it('rejects usernames with unsupported characters, including SQL-ish input', () => {
    for (const value of ['has space', 'semi;colon', "quote'", 'table%drop', 'emoji😀']) {
      assert.throws(() => normalizeUsername(value), ValidationError);
    }
  });

  it('rejects non-strings', () => {
    for (const value of [42, null, undefined, {}, []]) {
      assert.throws(() => normalizeUsername(value), ValidationError);
    }
  });

  it('names the offending field', () => {
    assert.throws(() => normalizeUsername('x', 'to_username'), /"to_username"/);
  });
});

describe('domain/password', () => {
  it('treats a missing password as "no password" unless it is required', () => {
    assert.equal(validatePassword(undefined), null);
    assert.equal(validatePassword(null), null);
    assert.equal(validatePassword(''), null);
    assert.throws(() => validatePassword(undefined, { required: true }), /required/);
  });

  it('enforces the length window', () => {
    assert.equal(validatePassword('longenough'), 'longenough');
    assert.throws(() => validatePassword('short'), /between 8 and 128/);
    assert.throws(() => validatePassword('a'.repeat(PASSWORD_MAX_LENGTH + 1)), ValidationError);
  });

  it('rejects non-string passwords', () => {
    assert.throws(() => validatePassword(12345678), ValidationError);
    assert.throws(() => validatePassword({}, { required: true }), ValidationError);
  });
});
