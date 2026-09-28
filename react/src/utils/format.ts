/**
 * Presentation helpers. Pure functions only, so they are cheap to unit test and cannot trigger a
 * re-render by themselves.
 */

const amountFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Format money, keeping the sign visible for debits.
 * @param amount
 * @param options.withSign prefix positive amounts with "+" (useful in a ledger)
 */
export function formatAmount(amount: number, { withSign = false } = {}): string {
  if (!Number.isFinite(amount)) return '—';
  const formatted = amountFormatter.format(Math.abs(amount));
  if (amount < 0) return `−${formatted}`;
  return withSign ? `+${formatted}` : formatted;
}

/** @param iso RFC 3339 timestamp from the API */
export function formatDateTime(iso: string): string {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? '—' : dateTimeFormatter.format(parsed);
}

/** @param iso timestamp of a transaction */
export function formatRelativeDay(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '—';
  const days = Math.floor((Date.now() - parsed.getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

/** @param cents-ish value used by chart labels */
export function formatCompactAmount(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amount);
}

/** Human label for a ledger row's counterparty. */
export function counterpartyLabel(counterparty: string | null, type: string): string {
  if (type === 'topup') return 'Top-up';
  return counterparty ?? '—';
}

/**
 * Build the "1-10 of 42" style label for a page.
 * @param page 1-based
 * @param perPage
 * @param total
 */
export function pageDescription(page: number, perPage: number, total: number): string {
  if (total === 0) return 'No transactions';
  const first = (page - 1) * perPage + 1;
  const last = Math.min(page * perPage, total);
  return `${first}–${last} of ${total}`;
}
