import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { login as loginRequest, register as registerRequest, type Credentials } from '../api/auth.api';
import { SESSION_EXPIRED_EVENT, clearSession, readSession, writeSession } from '../api/session';
import type { ApiUser, Session } from '../api/types';

/**
 * Authentication state for the whole app.
 *
 * The session lives in one place, is restored from localStorage on load, and is dropped automatically
 * when the token stops being accepted (the HTTP client fires SESSION_EXPIRED_EVENT, see api/session.ts).
 * Components only ask `useAuth()` for the current user or call `login` / `register` / `logout`.
 *
 * `register` and `login` do exactly the same thing with the answer — the API returns a user and a
 * token from both — so only the request differs; persisting the session is written once.
 */
interface AuthContextValue {
  user: ApiUser | null;
  isAuthenticated: boolean;
  login: (credentials: Credentials) => Promise<ApiUser>;
  register: (credentials: Credentials) => Promise<ApiUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => readSession());

  useEffect(() => {
    const handleExpired = () => setSession(null);
    window.addEventListener(SESSION_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleExpired);
  }, []);

  /** Store the session (localStorage + state) — the one place that decides what "signed in" means. */
  const persist = useCallback((session: Session) => {
    writeSession(session);
    setSession(session);
  }, []);

  const login = useCallback(
    async (credentials: Credentials) => {
      const { token, ...user } = await loginRequest(credentials);
      persist({ token, user });
      return user;
    },
    [persist],
  );

  const register = useCallback(
    async (credentials: Credentials) => {
      const { token, ...user } = await registerRequest(credentials);
      persist({ token, user });
      return user;
    },
    [persist],
  );

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      isAuthenticated: session !== null,
      login,
      register,
      logout,
    }),
    [session, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** @throws when used outside the provider, which is always a bug rather than a runtime condition */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>.');
  }
  return context;
}
