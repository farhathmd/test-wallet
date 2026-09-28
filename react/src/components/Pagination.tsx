import { pageDescription } from '../utils/format';

/**
 * Page controls for the transaction table.
 *
 * Deliberately simple (previous / next plus a description) because the API is offset paginated: the
 * user always knows which slice of the ledger they are looking at, and the buttons disable themselves
 * at the edges instead of issuing a request that would return an empty page.
 */
export function Pagination({
  page,
  perPage,
  total,
  totalPages,
  onPageChange,
  disabled = false,
}: {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}) {
  const isFirst = page <= 1;
  const isLast = page >= totalPages;

  return (
    <nav className="pagination" aria-label="Transaction pages">
      <span className="pagination__description">{pageDescription(page, perPage, total)}</span>
      <div className="pagination__controls">
        <button
          type="button"
          className="button button--ghost"
          onClick={() => onPageChange(page - 1)}
          disabled={disabled || isFirst}
        >
          ← Previous
        </button>
        <span className="pagination__page" aria-current="page">
          Page {page} / {totalPages}
        </span>
        <button
          type="button"
          className="button button--ghost"
          onClick={() => onPageChange(page + 1)}
          disabled={disabled || isLast}
        >
          Next →
        </button>
      </div>
    </nav>
  );
}
