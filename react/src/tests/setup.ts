import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

/**
 * Test environment setup.
 *
 * Adds jest-dom matchers (`toBeInTheDocument`, …) to Vitest's `expect`, and closes the jsdom gaps the
 * dashboard runs into: no `matchMedia` (Chart.js asks about reduced-motion, the theme asks about the OS
 * colour scheme) and a shared `localStorage` / `<html data-theme>` between test cases (neither the
 * session nor the theme may leak from one test to the next).
 */
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  cleanup();
});
