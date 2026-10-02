import { useCallback, useState } from 'react';
import { toApiError } from '../api/client';

/**
 * Submit state for a form that performs one action (create a wallet, top up, transfer).
 *
 * Three screens need the same three answers — "is it in flight?", "what did the server say?", "what
 * came back?" — so they live here instead of being copied into every page. Failures are shown as the
 * server's own message, exactly like the login form reports a rejected password.
 */
export interface FormSubmit<T> {
  submitting: boolean;
  /** The API's message for the last failed attempt, or a local "field is empty" message. */
  error: string | null;
  /** The value the action resolved with, or null before/after a failure. */
  result: T | null;
  submit: (action: () => Promise<T>) => Promise<T | null>;
}

/**
 * @param action the call to run; throw to report a problem (the page's own cheap checks do this)
 * @returns the resolved value, or null when the action failed
 */
export function useFormSubmit<T = void>(): FormSubmit<T> {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<T | null>(null);

  const submit = useCallback(async (action: () => Promise<T>): Promise<T | null> => {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const value = await action();
      setResult(value);
      return value;
    } catch (caught) {
      setError(toApiError(caught).message);
      return null;
    } finally {
      setSubmitting(false);
    }
  }, []);

  return { submitting, error, result, submit };
}
