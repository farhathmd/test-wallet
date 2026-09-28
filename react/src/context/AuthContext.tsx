import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { login as loginRequest, type Credentials } from '../api/auth.api';
import { SESSION_EXPIRED_EVENT, clearSession, readSession, writeSession } from '../api/session';
import type { ApiUser, Session } from '../api/types';

/**
 * Authentication state for the whole app.
 *
 * The session lives in one place, is restored from localStorage on load, and is dropped automatically
 * when the token stops being accepted (the HTTP client fires SESSION_EXPIRED_EVENT, see api/session.ts).
 * Components only ask `useAuth()` for the current user or call `login` / `logout`.
 */
interface AuthContextValue {
  user: ApiUser | null;
  isAuthenticated: boolean;
  login: (credentials: Credentials) => Promise<ApiUser>;
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

  const login = useCallback(async (credentials: Credentials) => {
    const { token, ...user } = await loginRequest(credentials);
    writeSession({ token, user });
    setSession({ token, user });
    return user;
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      isAuthenticated: session !== null,
      login,
      logout,
    }),
    [session, login, logout],
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
