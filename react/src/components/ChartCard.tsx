import type { ReactNode } from 'react';

/**
 * Shared frame for every chart: a heading, an optional caption, and one place that decides whether to
 * show the chart or say why there is nothing to show.
 */
export function ChartCard({
  title,
  caption,
  isEmpty,
  emptyMessage = 'No data for the current filters yet.',
  children,
}: {
  title: string;
  caption?: string;
  isEmpty: boolean;
  emptyMessage?: string;
  children: ReactNode;
}) {
  return (
    <section className="card chart-card" aria-label={title}>
      <header className="chart-card__header">
        <h2>{title}</h2>
        {caption ? <p className="chart-card__caption">{caption}</p> : null}
      </header>
      {isEmpty ? (
        <div className="state state--empty">
          <p>{emptyMessage}</p>
        </div>
      ) : (
        <div className="chart-card__canvas">{children}</div>
      )}
    </section>
  );
}
