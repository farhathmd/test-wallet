import type { Session } from './types';

/**
 * Session storage — the one place that reads and writes the session in localStorage.
 *
 * The token lives here (and not only in React state) so the Axios interceptor can read it without
 * depending on a component, and so a page reload keeps the user signed in. When the API rejects a
 * token with 401 the interceptor clears the session and fires SESSION_EXPIRED_EVENT, which the auth
 * context listens to; that way "token expired" is handled in one place instead of inside every call.
 */
const STORAGE_KEY = 'wallet.session';
export const SESSION_EXPIRED_EVENT = 'wallet:session-expired';

/** @returns {Session | null} the stored session, or null when absent/corrupt */
export function readSession(): Session | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (typeof parsed?.token !== 'string' || !parsed.user?.username) return null;
    return { token: parsed.token, user: parsed.user };
  } catch {
    // A corrupt value must never break the app: treat it as "not signed in".
    return null;
  }
}

export function writeSession(session: Session): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

/** @returns {string | null} bearer token for the next request, if any */
export function getToken(): string | null {
  return readSession()?.token ?? null;
}

/** Tells the app that the current token is no longer accepted (fired by the HTTP client). */
export function notifySessionExpired(): void {
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}
