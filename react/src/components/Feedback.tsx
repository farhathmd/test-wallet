import type { ReactNode } from 'react';
import type { ApiError } from '../api/client';

/**
 * The three states every remote panel has to render: loading, failed, empty.
 * Having them in one file keeps the states visually consistent across the dashboard.
 */

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="state state--loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorBanner({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  return (
    <div className="state state--error" role="alert">
      <div>
        <strong>{error.code === 'UNAUTHORIZED' ? 'Session expired' : 'Something went wrong'}</strong>
        <p>{error.message}</p>
      </div>
      {onRetry ? (
        <button type="button" className="button button--ghost" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="state state--empty">
      <p>{children}</p>
    </div>
  );
}
