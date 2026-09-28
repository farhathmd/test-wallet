import { ValidationError } from './errors';
import { PASSWORD_MAX_LENGTH, validatePassword } from './password';
import { normalizeUsername } from './username';

describe('domain/username', () => {
  it('normalises to lower case and trims', () => {
    expect(normalizeUsername('  Alice ')).toBe('alice');
    expect(normalizeUsername('ADMIN')).toBe('admin');
  });

  it('keeps usernames that only differ in case identical, so uniqueness is case-insensitive', () => {
    expect(normalizeUsername('Alice')).toBe(normalizeUsername('alice'));
  });

  it('accepts the documented character set', () => {
    for (const value of ['abc', 'user_1', 'first.last', 'with-dash', 'a'.repeat(32)]) {
      expect(normalizeUsername(value)).toBe(value);
    }
  });

  it('rejects usernames that are too short or too long', () => {
    expect(() => normalizeUsername('ab')).toThrow(/between 3 and 32/);
    expect(() => normalizeUsername('a'.repeat(33))).toThrow(ValidationError);
  });

  it('rejects unsupported characters, including SQL-ish input', () => {
    for (const value of ['has space', 'semi;colon', "quote'", 'table%drop', 'emoji😀']) {
      expect(() => normalizeUsername(value)).toThrow(ValidationError);
    }
  });

  it('rejects non-strings', () => {
    for (const value of [42, null, undefined, {}, []]) {
      expect(() => normalizeUsername(value)).toThrow(ValidationError);
    }
  });

  it('names the offending field', () => {
    expect(() => normalizeUsername('x', 'to_username')).toThrow(/"to_username"/);
  });
});

describe('domain/password', () => {
  it('treats a missing password as "no password" unless it is required', () => {
    expect(validatePassword(undefined)).toBeNull();
    expect(validatePassword(null)).toBeNull();
    expect(validatePassword('')).toBeNull();
    expect(() => validatePassword(undefined, { required: true })).toThrow(/required/);
  });

  it('enforces the length window', () => {
    expect(validatePassword('longenough')).toBe('longenough');
    expect(() => validatePassword('short')).toThrow(/between 8 and 128/);
    expect(() => validatePassword('a'.repeat(PASSWORD_MAX_LENGTH + 1))).toThrow(ValidationError);
  });

  it('rejects non-string passwords', () => {
    expect(() => validatePassword(12345678)).toThrow(ValidationError);
    expect(() => validatePassword({}, { required: true })).toThrow(ValidationError);
  });
});
