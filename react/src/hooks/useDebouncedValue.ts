import { useEffect, useState } from 'react';

/**
 * Debounce a fast-changing value (the search box).
 *
 * Typing "carol" would otherwise fire six requests; with a 350 ms debounce it fires one, and the
 * table never shows a result from a query the user has already moved on from.
 *
 * @param value the value to debounce
 * @param delayMs quiet period before the value is published
 */
export function useDebouncedValue<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
