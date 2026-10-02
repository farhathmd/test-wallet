/**
 * Theme storage.
 *
 * Same shape as `api/session.ts`: this is the only module that touches the theme in localStorage, so
 * the key and the "a corrupt value must never break the app" rule live in one place. The theme itself
 * is expressed on `<html>` as `data-theme`, which is what the stylesheet switches on; this module only
 * decides *which* value goes there.
 */
export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'wallet.theme';

/** @returns {Theme | null} the saved choice, or null when absent/corrupt (i.e. "no choice yet") */
export function readTheme(): Theme | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    return null;
  }
}

export function writeTheme(theme: Theme): void {
  window.localStorage.setItem(STORAGE_KEY, theme);
}

/** No saved choice yet: follow the operating system, defaulting to light where it is unknown. */
export function resolveInitialTheme(): Theme {
  const prefersDark =
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return readTheme() ?? (prefersDark ? 'dark' : 'light');
}

/** Applies the theme to the document. Everything visual (including `color-scheme`) is driven from CSS. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}
