import { post } from './client';
import type { AuthenticatedUser } from './types';

/**
 * Authentication calls.
 *
 * The API is documented as "register by username" plus an optional password, and the dashboard logs
 * in with a username + password, so only /login is needed here.
 */
export interface Credentials {
  username: string;
  password: string;
}

/** POST /login → the user plus a bearer token. */
export function login(credentials: Credentials): Promise<AuthenticatedUser> {
  return post<AuthenticatedUser>('/login', credentials);
}

/** POST /register → creates a wallet; available for completeness (the dashboard only logs in). */
export function register(credentials: Credentials): Promise<AuthenticatedUser> {
  return post<AuthenticatedUser>('/register', credentials);
}
