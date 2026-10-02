import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js';

/**
 * Chart.js tree shaking.
 *
 * Chart.js registers everything by default unless you opt in, so only the pieces the dashboard
 * actually draws are imported and registered here (bar + doughnut). This is the one place that talks
 * to the Chart.js API directly; the components only hand it data. Text and gridline colours are not set
 * here — they come from the per-theme palette in options.ts, so nothing pinned to one theme leaks in.
 */
let registered = false;

export function registerCharts(): void {
  if (registered) return;
  Chart.register(ArcElement, BarElement, CategoryScale, Legend, LinearScale, Tooltip);
  registered = true;
  Chart.defaults.font.family =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
}
