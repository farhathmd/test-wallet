import { formatAmount } from '../utils/format';

/**
 * A single headline number with a label and an optional hint.
 * @param props.label what the number means
 * @param props.value already formatted value (money, count, …)
 * @param props.tone colours the value: money in green, money out red, neutral otherwise
 */
export function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: 'neutral' | 'credit' | 'debit';
}) {
  const rendered = typeof value === 'number' ? formatAmount(value) : value;
  return (
    <article className={`stat-card stat-card--${tone}`}>
      <p className="stat-card__label">{label}</p>
      <p className="stat-card__value">{rendered}</p>
      {hint ? <p className="stat-card__hint">{hint}</p> : null}
    </article>
  );
}
