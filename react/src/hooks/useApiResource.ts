import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, toApiError } from '../api/client';

/**
 * One hook for every "load some data" need.
 *
 * It keeps the previous data on screen while a new request runs (no chart flicker), cancels the state
 * update when the component unmounts or the request is superseded (no "setState after unmount" and no
 * out-of-order responses overwriting newer data), and exposes a `reload` for retry buttons.
 */
export interface Resource<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
}

/**
 * @param loader function returning the promise to await
 * @param deps dependencies that should trigger a refetch (compared shallowly)
 */
export function useApiResource<T>(loader: () => Promise<T>, deps: unknown[]): Resource<T> {
  const [state, setState] = useState<{ data: T | null; error: ApiError | null; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  });
  const [reloadCount, setReloadCount] = useState(0);

  // Kept in a ref so a re-created closure does not by itself trigger a refetch.
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    let cancelled = false;
    setState((previous) => ({ ...previous, loading: true, error: null }));

    loaderRef.current().then(
      (data) => {
        if (!cancelled) setState({ data, error: null, loading: false });
      },
      (error: unknown) => {
        if (!cancelled) setState({ data: null, error: toApiError(error), loading: false });
      },
    );

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadCount]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  return { ...state, reload };
}
