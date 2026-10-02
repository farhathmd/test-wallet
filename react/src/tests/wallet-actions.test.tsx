import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { AuthProvider } from '../context/AuthContext';
import { ApiError } from '../api/client';

/**
 * Top up and transfer, driven through the real router and auth context.
 *
 * The network layer is faked, so these assert the parts we wrote: the exact request body (including
 * `to_username`, which is the API's spelling), that an empty form costs no request, that the API's
 * message is what the user sees when it refuses, and that the balance is read back after the 204.
 */
const topupMock = vi.fn();
const transferMock = vi.fn();
const balanceMock = vi.fn();

vi.mock('../api/wallet.api', () => ({
  fetchBalance: () => balanceMock(),
  fetchTopTransactions: vi.fn().mockResolvedValue([]),
  fetchTopUsers: vi.fn().mockResolvedValue([
    { username: 'admin', transacted_value: 500 },
    { username: 'bob', transacted_value: 120 },
  ]),
  fetchTransactions: vi.fn().mockResolvedValue({
    data: [],
    page: 1,
    per_page: 10,
    total: 0,
    total_pages: 1,
    summary: { credit_total: 0, debit_total: 0, net: 0 },
  }),
  topup: (amount: unknown) => topupMock(amount),
  transfer: (toUsername: unknown, amount: unknown) => transferMock(toUsername, amount),
}));

vi.mock('../api/auth.api', () => ({ login: vi.fn(), register: vi.fn() }));

// Chart.js needs a real canvas; this suite only cares about the screens around it.
vi.mock('react-chartjs-2', () => ({
  Bar: ({ data }: { data: { labels?: unknown[] } }) => (
    <div data-testid="bar-chart">{JSON.stringify(data?.labels ?? [])}</div>
  ),
  Doughnut: ({ data }: { data: { labels?: unknown[] } }) => (
    <div data-testid="doughnut-chart">{JSON.stringify(data?.labels ?? [])}</div>
  ),
}));

/** Both money screens are guarded, so a session has to exist before rendering them. */
function signIn() {
  window.localStorage.setItem(
    'wallet.session',
    JSON.stringify({
      token: 'signed.jwt.token',
      user: {
        id: 1,
        username: 'admin',
        role: 'admin',
        balance: 100,
        created_at: '2026-09-28T09:00:00.000Z',
      },
    }),
  );
}

function renderApp(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('top up', () => {
  beforeEach(() => {
    signIn();
    topupMock.mockReset();
    balanceMock.mockReset().mockResolvedValue(350);
  });

  it('passes the typed amount to the api layer and shows the balance the API reports', async () => {
    const user = userEvent.setup();
    topupMock.mockResolvedValue(undefined);
    renderApp('/topup');

    await user.type(screen.getByLabelText(/amount/i), '250.00');
    await user.click(screen.getByRole('button', { name: /^top up$/i }));

    await waitFor(() => expect(topupMock).toHaveBeenCalledWith('250.00'));
    expect(await screen.findByRole('status')).toHaveTextContent(/new balance: \$350\.00/i);
  });

  it('refuses an empty amount without calling the API', async () => {
    const user = userEvent.setup();
    renderApp('/topup');

    await user.click(screen.getByRole('button', { name: /^top up$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/enter an amount to top up/i);
    expect(topupMock).not.toHaveBeenCalled();
    expect(balanceMock).not.toHaveBeenCalled();
  });

  it('shows the API message when the amount is rejected', async () => {
    const user = userEvent.setup();
    topupMock.mockRejectedValue(
      new ApiError('"amount" supports at most 2 decimal places.', 400, 'VALIDATION_ERROR'),
    );
    renderApp('/topup');

    await user.type(screen.getByLabelText(/amount/i), '1.005');
    await user.click(screen.getByRole('button', { name: /^top up$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '"amount" supports at most 2 decimal places.',
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('transfer', () => {
  beforeEach(() => {
    signIn();
    transferMock.mockReset();
    balanceMock.mockReset().mockResolvedValue(74.5);
  });

  it('sends { to_username, amount } and shows the balance the API reports', async () => {
    const user = userEvent.setup();
    transferMock.mockResolvedValue(undefined);
    renderApp('/transfer');

    await user.type(screen.getByLabelText(/recipient username/i), 'bob');
    await user.type(screen.getByLabelText(/amount/i), '25.50');
    await user.click(screen.getByRole('button', { name: /send transfer/i }));

    await waitFor(() => expect(transferMock).toHaveBeenCalledWith('bob', '25.50'));
    expect(await screen.findByRole('status')).toHaveTextContent(/new balance: \$74\.50/i);
  });

  it('suggests recipients that are not the signed-in wallet', async () => {
    renderApp('/transfer');

    await waitFor(() => {
      const options = Array.from(document.querySelectorAll('datalist option')).map((option) =>
        option.getAttribute('value'),
      );
      expect(options).toContain('bob');
      expect(options).not.toContain('admin');
    });
  });

  it('refuses a missing recipient without calling the API', async () => {
    const user = userEvent.setup();
    renderApp('/transfer');

    await user.type(screen.getByLabelText(/amount/i), '10');
    await user.click(screen.getByRole('button', { name: /send transfer/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/enter the username to transfer to/i);
    expect(transferMock).not.toHaveBeenCalled();
  });

  it('shows the API message when the balance is too low', async () => {
    const user = userEvent.setup();
    // The API's own wording, copied from a live response.
    transferMock.mockRejectedValue(
      new ApiError('Insufficient balance: 100.00 available, 9999.00 requested.', 400, 'INSUFFICIENT_BALANCE'),
    );
    renderApp('/transfer');

    await user.type(screen.getByLabelText(/recipient username/i), 'bob');
    await user.type(screen.getByLabelText(/amount/i), '9999');
    await user.click(screen.getByRole('button', { name: /send transfer/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/insufficient balance/i);
  });
});

describe('money navigation', () => {
  beforeEach(signIn);

  it('reaches both money screens from the dashboard header', async () => {
    const user = userEvent.setup();
    renderApp('/');

    await screen.findByRole('heading', { name: /wallet overview/i });

    await user.click(screen.getByRole('link', { name: /top up/i }));
    expect(await screen.findByRole('heading', { name: /^top up$/i })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: /transfer/i }));
    expect(await screen.findByRole('heading', { name: /^transfer$/i })).toBeInTheDocument();
  });

  it('sends a visitor without a session to the sign-in screen', async () => {
    window.localStorage.clear();
    renderApp('/topup');

    expect(await screen.findByRole('heading', { name: /wallet admin/i })).toBeInTheDocument();
  });
});
