import { useTheme } from '../context/ThemeContext';

/**
 * Dark / light switch.
 *
 * The button only *toggles*; the theme itself lives on `<html data-theme>` and in the stylesheet, so
 * nothing here knows a colour. The accessible name stays "Dark mode" and `aria-pressed` reports whether
 * it is on — a name that swapped to the *action* as well would leave a screen reader saying two
 * different things about one control. The glyph is decoration; the tooltip spells out the action.
 */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      className="button button--ghost theme-toggle"
      onClick={toggleTheme}
      aria-pressed={isDark}
      aria-label="Dark mode"
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      <span aria-hidden="true">{isDark ? '☀' : '☾'}</span>
    </button>
  );
}
