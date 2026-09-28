import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { ApiError } from '../api/client';
import { AuthProvider } from '../context/AuthContext';
import type { TransactionPage } from '../api/types';

/**
 * Dashboard behaviour with the network layer faked: what the cards show, which rows reach the table,
 * how filters and paging translate into requests, and how the loading/empty/error states render.
 */
const fetchBalance = vi.fn();
const fetchTopTransactions = vi.fn();
const fetchTopUsers = vi.fn();
const fetchTransactions = vi.fn();

vi.mock('../api/wallet.api', () => ({
  fetchBalance: () => fetchBalance(),
  fetchTopTransactions: (limit: number) => fetchTopTransactions(limit),
  fetchTopUsers: (limit: number) => fetchTopUsers(limit),
  fetchTransactions: (query: unknown) => fetchTransactions(query),
}));

vi.mock('../api/auth.api', () => ({ login: vi.fn(), register: vi.fn() }));

// Chart.js needs a canvas; asserting the data reaching each chart is enough here, because the builders
// themselves are covered by format-and-charts.test.ts.
vi.mock('react-chartjs-2', () => ({
  Bar: ({ data }: { data: { labels?: unknown[] } }) => (
    <div data-testid="bar-chart">{JSON.stringify(data?.labels ?? [])}</div>
  ),
  Doughnut: ({ data }: { data: { labels?: unknown[] } }) => (
    <div data-testid="doughnut-chart">{JSON.stringify(data?.labels ?? [])}</div>
  ),
}));

const PAGE_ONE: TransactionPage = {
  data: [
    {
      id: 12,
      type: 'transfer',
      direction: 'debit',
      counterparty: 'bob',
      amount: 200.25,
      created_at: '2026-09-28T09:12:44.101Z',
    },
    {
      id: 4,
      type: 'topup',
      direction: 'credit',
      counterparty: null,
      amount: 1000.5,
      created_at: '2026-09-28T09:10:02.550Z',
    },
  ],
  page: 1,
  per_page: 2,
  total: 3,
  total_pages: 2,
  summary: { credit_total: 1000.5, debit_total: 200.25, net: 800.25 },
};

const PAGE_TWO: TransactionPage = {
  data: [
    {
      id: 1,
      type: 'transfer',
      direction: 'credit',
      counterparty: 'carol',
      amount: 50,
      created_at: '2026-09-27T08:00:00.000Z',
    },
  ],
  page: 2,
  per_page: 2,
  total: 3,
  total_pages: 2,
  summary: { credit_total: 1050.5, debit_total: 200.25, net: 850.25 },
};

function signIn(role: 'user' | 'admin' = 'admin') {
  window.localStorage.setItem(
    'wallet.session',
    JSON.stringify({
      token: 'signed.jwt.token',
      user: {
        id: 1,
        username: role === 'admin' ? 'admin' : 'alice',
        role,
        balance: 800.25,
        created_at: '2026-09-28T09:00:00.000Z',
      },
    }),
  );
}

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('dashboard', () => {
  beforeEach(() => {
    fetchBalance.mockResolvedValue(800.25);
    fetchTopTransactions.mockResolvedValue([
      { username: 'bob', amount: -200.25 },
      { username: 'carol', amount: 50 },
    ]);
    fetchTopUsers.mockResolvedValue([{ username: 'alice', transacted_value: 150 }]);
    fetchTransactions.mockResolvedValue(PAGE_ONE);
    signIn('admin');
  });

  it('shows the wallet cards, the ledger and the charts', async () => {
    renderDashboard();

    const balanceCard = (await screen.findByText('Current balance')).closest('.stat-card') as HTMLElement;
    expect(within(balanceCard).getByText('$800.25')).toBeInTheDocument();
    // Queried by the card label class: "Money in" / "Money out" are also filter options.
    const inCard = screen.getByText('Money in', { selector: '.stat-card__label' }).closest('.stat-card') as HTMLElement;
    expect(within(inCard).getByText('$1,000.50')).toBeInTheDocument();
    const outCard = screen.getByText('Money out', { selector: '.stat-card__label' }).closest('.stat-card') as HTMLElement;
    expect(within(outCard).getByText('$200.25')).toBeInTheDocument();
    expect(screen.getByText('+$800.25')).toBeInTheDocument();

    // Ledger rows: a signed debit and a topup without a counterparty.
    const table = screen.getByRole('table');
    expect(within(table).getByText('bob')).toBeInTheDocument();
    expect(within(table).getByText('−$200.25')).toBeInTheDocument();
    expect(within(table).getByText('+$1,000.50')).toBeInTheDocument();
    expect(within(table).getByText('Top-up')).toBeInTheDocument();
    expect(within(table).getAllByText('—').length).toBeGreaterThan(0);

    // The charts received the ranked data: transactions first, then the cross-wallet ranking.
    const barCharts = screen.getAllByTestId('bar-chart');
    expect(barCharts).toHaveLength(2);
    expect(barCharts[0]).toHaveTextContent(/bob/);
    expect(barCharts[1]).toHaveTextContent(/alice/);
    expect(screen.getByTestId('doughnut-chart')).toHaveTextContent('Money in');
    expect(screen.getByText('1–2 of 3')).toBeInTheDocument();
  });

  it('requests the next page when the user pages forward', async () => {
    const user = userEvent.setup();
    fetchTransactions.mockResolvedValueOnce(PAGE_ONE).mockResolvedValue(PAGE_TWO);
    renderDashboard();

    await screen.findByText('1–2 of 3');
    await user.click(screen.getByRole('button', { name: /next/i }));

    await waitFor(() => {
      // The dashboard keeps its own page size; the fixture only describes what the API returned.
      expect(fetchTransactions).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
    });
    expect(await screen.findByText('3–3 of 3')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText('carol')).toBeInTheDocument();
  });

  it('sends the search term once, debounced, and resets to page 1', async () => {
    const user = userEvent.setup();
    renderDashboard();

    const search = await screen.findByLabelText(/search counterparty/i);
    await user.type(search, 'bob');

    await waitFor(
      () => {
        expect(fetchTransactions).toHaveBeenCalledWith(expect.objectContaining({ q: 'bob', page: 1 }));
      },
      { timeout: 3000 },
    );
    // One request for the debounced keystrokes, not one per character.
    const searchCalls = fetchTransactions.mock.calls.filter(
      ([query]) => (query as { q?: string }).q !== undefined,
    );
    expect(searchCalls).toHaveLength(1);
  });

  it('offers the cross-wallet filter to admins only', async () => {
    const { unmount } = renderDashboard();
    expect(await screen.findByLabelText(/wallet \(admin\)/i)).toBeInTheDocument();
    unmount();

    window.localStorage.clear();
    signIn('user');
    renderDashboard();

    await screen.findByText('1–2 of 3');
    expect(screen.queryByLabelText(/wallet \(admin\)/i)).not.toBeInTheDocument();
  });

  it('renders the empty state when nothing matches', async () => {
    fetchTransactions.mockResolvedValue({ ...PAGE_ONE, data: [], total: 0, total_pages: 1 });
    renderDashboard();

    expect(await screen.findByText(/no transactions match these filters/i)).toBeInTheDocument();
  });

  it('shows the API error and retries on demand', async () => {
    const user = userEvent.setup();
    fetchTransactions.mockRejectedValueOnce(new ApiError('Cannot reach the API.', 0, 'NETWORK_ERROR'));
    renderDashboard();

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the API.');

    fetchTransactions.mockResolvedValue(PAGE_ONE);
    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByText('1–2 of 3')).toBeInTheDocument();
  });
});
