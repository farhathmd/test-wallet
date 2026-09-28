import { ValidationError } from './errors.js';

/**
 * Username rules shared by register, login and transfer.
 *
 * Usernames are stored normalised (trimmed, lowercased). Normalising instead of relying on a
 * case-insensitive index keeps one plain UNIQUE constraint, makes lookups deterministic and makes
 * `Alice` impossible to register next to `alice`. Callers get the normalised value back, so the
 * API never reports a username it cannot look up again.
 */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;
export const USERNAME_PATTERN = /^[a-z0-9_.-]+$/;

/**
 * @param {unknown} value raw username from a request
 * @param {string} field name used in the error message
 * @returns {string} normalised username
 * @throws {ValidationError}
 */
export function normalizeUsername(value, field = 'username') {
  if (typeof value !== 'string') {
    throw new ValidationError(`"${field}" is required and must be a string.`, { field });
  }
  const normalized = value.trim().toLowerCase();
  if (normalized.length < USERNAME_MIN_LENGTH || normalized.length > USERNAME_MAX_LENGTH) {
    throw new ValidationError(
      `"${field}" must be between ${USERNAME_MIN_LENGTH} and ${USERNAME_MAX_LENGTH} characters.`,
      { field },
    );
  }
  if (!USERNAME_PATTERN.test(normalized)) {
    throw new ValidationError(
      `"${field}" may only contain letters, numbers, underscore, dot and dash.`,
      { field },
    );
  }
  return normalized;
}
