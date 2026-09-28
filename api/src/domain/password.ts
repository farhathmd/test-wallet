import { ValidationError } from './errors';

/**
 * Password policy, shared by register and login.
 *
 * Passwords are optional on purpose: the wallet API is specified as "register by username", while
 * the admin dashboard logs in with a username + password. A login attempt on a password-less account
 * therefore fails as Unauthorized instead of being treated as a validation error.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Validate an optional password.
 *
 * @param value raw value from the request body
 * @param options.field name used in the error message
 * @param options.required when true, a missing password is a validation error (login)
 * @returns the password, or null when it was not supplied
 * @throws {ValidationError}
 */
export function validatePassword(
  value: unknown,
  { field = 'password', required = false }: { field?: string; required?: boolean } = {},
): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw new ValidationError(`"${field}" is required.`, { field });
    }
    return null;
  }
  if (typeof value !== 'string') {
    throw new ValidationError(`"${field}" must be a string.`, { field });
  }
  if (value.length < PASSWORD_MIN_LENGTH || value.length > PASSWORD_MAX_LENGTH) {
    throw new ValidationError(
      `"${field}" must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`,
      { field },
    );
  }
  return value;
}
