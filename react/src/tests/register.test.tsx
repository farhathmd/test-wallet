import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { AuthProvider } from '../context/AuthContext';
import { ApiError } from '../api/client';

/**
 * Register flow, driven through the real router and auth context.
 *
 * Only the network layer is faked, so this covers what we wrote: the form, the sign-up link from
 * /login, the API's own error message, and the fact that a 201 signs the new wallet in (the API returns
 * a token from /register exactly as it does from /login).
 */
const registerMock = vi.fn();
vi.mock('../api/auth.api', () => ({
  login: vi.fn(),
  register: (credentials: unknown) => registerMock(credentials),
}));

vi.mock('../api/wallet.api', () => ({
  fetchBalance: vi.fn().mockResolvedValue(0),
  fetchTopTransactions: vi.fn().mockResolvedValue([]),
  fetchTopUsers: vi.fn().mockResolvedValue([]),
  fetchTransactions: vi.fn().mockResolvedValue({
    data: [],
    page: 1,
    per_page: 10,
    total: 0,
    total_pages: 1,
    summary: { credit_total: 0, debit_total: 0, net: 0 },
  }),
  topup: vi.fn(),
  transfer: vi.fn(),
}));

// Chart.js needs a real canvas; this suite only cares about the screens around it.
vi.mock('react-chartjs-2', () => ({
  Bar: ({ data }: { data: { labels?: unknown[] } }) => (
    <div data-testid="bar-chart">{JSON.stringify(data?.labels ?? [])}</div>
  ),
  Doughnut: ({ data }: { data: { labels?: unknown[] } }) => (
    <div data-testid="doughnut-chart">{JSON.stringify(data?.labels ?? [])}</div>
  ),
}));

const createdUser = {
  id: 7,
  username: 'bob',
  role: 'user' as const,
  balance: 0,
  created_at: '2026-09-28T09:00:00.000Z',
  token: 'registered.jwt.token',
};

function renderApp(initialPath = '/register') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('register', () => {
  beforeEach(() => {
    registerMock.mockReset();
  });

  it('shows the sign-up form at /register', () => {
    renderApp();

    expect(screen.getByRole('heading', { name: /create a wallet/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('reaches /register from the sign-in screen', async () => {
    const user = userEvent.setup();
    renderApp('/login');

    await user.click(screen.getByRole('link', { name: /create one/i }));

    expect(await screen.findByRole('heading', { name: /create a wallet/i })).toBeInTheDocument();
  });

  it('refuses to submit empty fields without calling the API', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: /create wallet/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/choose a username and a password/i);
    expect(registerMock).not.toHaveBeenCalled();
  });

  it('sends the credentials, signs the new wallet in and lands on the dashboard', async () => {
    const user = userEvent.setup();
    registerMock.mockResolvedValue(createdUser);
    renderApp();

    await user.type(screen.getByLabelText(/username/i), 'bob');
    await user.type(screen.getByLabelText(/password/i), 'passw0rd!');
    await user.click(screen.getByRole('button', { name: /create wallet/i }));

    await waitFor(() => {
      expect(registerMock).toHaveBeenCalledWith({ username: 'bob', password: 'passw0rd!' });
    });
    expect(await screen.findByRole('heading', { name: /wallet overview/i })).toBeInTheDocument();
    expect(window.localStorage.getItem('wallet.session')).toContain('registered.jwt.token');
  });

  it('shows the API message when the username is taken and stays on the form', async () => {
    const user = userEvent.setup();
    registerMock.mockRejectedValue(new ApiError('Username is already taken.', 409, 'CONFLICT'));
    renderApp();

    await user.type(screen.getByLabelText(/username/i), 'admin');
    await user.type(screen.getByLabelText(/password/i), 'admin12345');
    await user.click(screen.getByRole('button', { name: /create wallet/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Username is already taken.');
    expect(screen.getByRole('heading', { name: /create a wallet/i })).toBeInTheDocument();
    expect(window.localStorage.getItem('wallet.session')).toBeNull();
  });

  it('sends a signed-in visitor to the dashboard instead of showing the form', async () => {
    window.localStorage.setItem(
      'wallet.session',
      JSON.stringify({
        token: 'signed.jwt.token',
        user: { id: 1, username: 'admin', role: 'admin', balance: 10, created_at: '2026-09-28T09:00:00.000Z' },
      }),
    );

    renderApp();

    expect(await screen.findByRole('heading', { name: /wallet overview/i })).toBeInTheDocument();
    expect(registerMock).not.toHaveBeenCalled();
  });
});
