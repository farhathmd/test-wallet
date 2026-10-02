import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ThemeToggle } from '../components/ThemeToggle';
import { ThemeProvider } from '../context/ThemeContext';
import { readTheme, resolveInitialTheme } from '../theme/theme';

/**
 * Theme behaviour: where the initial value comes from, and what a toggle writes back.
 *
 * The provider and the toggle are exercised on their own rather than through `App` — this is the layer
 * where "the theme is one attribute on `<html>`" is worth asserting directly. (That the toggle is
 * actually *reachable* on the sign-in page and in the signed-in header is covered in login.test.tsx and
 * dashboard.test.tsx, which render the real app.)
 */
function renderToggle() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

describe('theme', () => {
  it('starts light when nothing is stored and the OS has no preference', () => {
    expect(resolveInitialTheme()).toBe('light');
  });

  it('restores a stored choice', () => {
    window.localStorage.setItem('wallet.theme', 'dark');

    expect(resolveInitialTheme()).toBe('dark');
  });

  it('follows the OS preference when there is no stored choice', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);

    expect(resolveInitialTheme()).toBe('dark');
  });

  it('ignores an unrecognised stored value', () => {
    window.localStorage.setItem('wallet.theme', 'midnight');

    expect(readTheme()).toBeNull();
    expect(resolveInitialTheme()).toBe('light');
  });

  it('applies the stored theme to <html> on mount', () => {
    window.localStorage.setItem('wallet.theme', 'dark');

    renderToggle();

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });

  it('toggles the theme, the document and the stored choice', async () => {
    const user = userEvent.setup();
    renderToggle();

    // Nothing stored and no OS preference, so the switch is off and the document is light.
    const toggle = screen.getByRole('button', { name: /dark mode/i });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');

    await user.click(toggle);

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(readTheme()).toBe('dark');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });
});
