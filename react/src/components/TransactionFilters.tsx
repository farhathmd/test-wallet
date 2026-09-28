import { useId } from 'react';
import type { Direction, TransactionQuery, TransactionType } from '../api/types';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useEffect, useState } from 'react';

/**
 * Search + filter controls for the ledger table.
 *
 * The component owns the fast-changing, local state (the text being typed, the selected filter) and
 * reports a complete query object upwards; the dashboard only has to say "here is the new query".
 * The search term is debounced so typing does not fire a request per keystroke.
 *
 * The "wallet" field appears only for admins, matching what the API allows (any other user gets a 403
 * for another wallet's ledger).
 */
export function TransactionFilters({
  query,
  isAdmin,
  disabled = false,
  onChange,
}: {
  query: TransactionQuery;
  isAdmin: boolean;
  disabled?: boolean;
  onChange: (query: TransactionQuery) => void;
}) {
  const [search, setSearch] = useState(query.q ?? '');
  const [username, setUsername] = useState(query.username ?? '');
  const debouncedSearch = useDebouncedValue(search);
  const debouncedUsername = useDebouncedValue(username);
  const ids = { search: useId(), type: useId(), direction: useId(), from: useId(), to: useId(), username: useId() };

  // Push debounced text into the query, always resetting to page 1 (a filter change that lands on
  // page 7 of the previous result set is never what the user meant).
  useEffect(() => {
    const nextSearch = debouncedSearch.trim();
    const nextUsername = debouncedUsername.trim();
    if (nextSearch === (query.q ?? '') && nextUsername === (query.username ?? '')) return;
    onChange({ ...query, page: 1, q: nextSearch, username: nextUsername });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, debouncedUsername]);

  const update = (patch: Partial<TransactionQuery>) => onChange({ ...query, ...patch, page: 1 });

  return (
    <form className="filters" onSubmit={(event) => event.preventDefault()} role="search">
      <div className="filters__field filters__field--wide">
        <label htmlFor={ids.search}>Search counterparty</label>
        <input
          id={ids.search}
          type="search"
          placeholder="e.g. bob"
          value={search}
          maxLength={64}
          disabled={disabled}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <div className="filters__field">
        <label htmlFor={ids.type}>Type</label>
        <select
          id={ids.type}
          value={query.type ?? ''}
          disabled={disabled}
          onChange={(event) => update({ type: event.target.value as TransactionType | '' })}
        >
          <option value="">All types</option>
          <option value="transfer">Transfer</option>
          <option value="topup">Top-up</option>
        </select>
      </div>

      <div className="filters__field">
        <label htmlFor={ids.direction}>Direction</label>
        <select
          id={ids.direction}
          value={query.direction ?? ''}
          disabled={disabled}
          onChange={(event) => update({ direction: event.target.value as Direction | '' })}
        >
          <option value="">Both</option>
          <option value="credit">Money in</option>
          <option value="debit">Money out</option>
        </select>
      </div>

      <div className="filters__field">
        <label htmlFor={ids.from}>From</label>
        <input
          id={ids.from}
          type="date"
          value={query.from ?? ''}
          disabled={disabled}
          onChange={(event) => update({ from: event.target.value })}
        />
      </div>

      <div className="filters__field">
        <label htmlFor={ids.to}>To</label>
        <input
          id={ids.to}
          type="date"
          value={query.to ?? ''}
          disabled={disabled}
          onChange={(event) => update({ to: event.target.value })}
        />
      </div>

      {isAdmin ? (
        <div className="filters__field">
          <label htmlFor={ids.username}>Wallet (admin)</label>
          <input
            id={ids.username}
            type="text"
            placeholder="another username"
            value={username}
            maxLength={32}
            disabled={disabled}
            onChange={(event) => setUsername(event.target.value)}
          />
        </div>
      ) : null}

      <div className="filters__actions">
        <button
          type="button"
          className="button button--ghost"
          disabled={disabled}
          onClick={() => {
            setSearch('');
            setUsername('');
            onChange({ page: 1, per_page: query.per_page });
          }}
        >
          Reset
        </button>
      </div>
    </form>
  );
}
