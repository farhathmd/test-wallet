import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { applyTheme, resolveInitialTheme, writeTheme, type Theme } from '../theme/theme';

/**
 * Theme state for the whole app.
 *
 * The provider is mounted inside `App` rather than in `main.tsx` so that every route — including the
 * ones rendered directly by the tests — sits inside exactly one provider; the theme is a document-level
 * concern, not a session one.
 *
 * The theme is applied in a *layout* effect on purpose: React runs those before the browser paints, so
 * someone who chose dark never sees a light flash on load. Only an explicit toggle is persisted, which
 * leaves the OS preference free to seed the next visit until the visitor makes a choice.
 */
interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(resolveInitialTheme);

  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    writeTheme(next);
    setTheme(next);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** @throws when used outside the provider, which is always a bug rather than a runtime condition */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used inside <ThemeProvider>.');
  }
  return context;
}
