import { validatePassword } from '../../domain/password';
import { normalizeUsername } from '../../domain/username';
import { requiredField, requireJsonObject } from './parsers';

/** POST /register — username plus an optional password (wallet-only accounts are supported). */
export interface RegisterInput {
  username: string;
  password: string | null;
}

/** POST /login — both credentials are required here; an absent password is a validation error. */
export interface LoginInput {
  username: string;
  password: string;
}

export function parseRegisterBody(body: unknown): RegisterInput {
  const object = requireJsonObject(body);
  return {
    username: normalizeUsername(requiredField(object, 'username')),
    password: validatePassword(object.password),
  };
}

export function parseLoginBody(body: unknown): LoginInput {
  const object = requireJsonObject(body);
  const password = requiredField(object, 'password');
  return {
    username: normalizeUsername(requiredField(object, 'username')),
    password: validatePassword(password, { required: true }) as string,
  };
}
