import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { AuthProvider } from '../context/AuthContext';
import { ApiError } from '../api/client';

/**
 * Login flow, driven through the real router and auth context.
 *
 * Only the network layer is faked (`api/auth.api`, `api/wallet.api`), so the test covers the parts we
 * actually wrote: form validation, the error message, session persistence and the redirect.
 */
const loginMock = vi.fn();
vi.mock('../api/auth.api', () => ({
  login: (credentials: unknown) => loginMock(credentials),
  register: vi.fn(),
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
}));

// Chart.js needs a real canvas; the dashboard tests only care about the surrounding UI.
vi.mock('react-chartjs-2', () => ({
  Bar: ({ data }: { data: { labels?: unknown[] } }) => (
    <div data-testid="bar-chart">{JSON.stringify(data?.labels ?? [])}</div>
  ),
  Doughnut: ({ data }: { data: { labels?: unknown[] } }) => (
    <div data-testid="doughnut-chart">{JSON.stringify(data?.labels ?? [])}</div>
  ),
}));

function renderApp(initialPath = '/login') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('login', () => {
  beforeEach(() => {
    loginMock.mockReset();
  });

  it('shows the sign-in form when there is no session', () => {
    renderApp();

    expect(screen.getByRole('heading', { name: /wallet admin/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('refuses to submit empty fields without calling the API', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/both your username and your password/i);
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('sends the credentials, stores the session and lands on the dashboard', async () => {
    const user = userEvent.setup();
    loginMock.mockResolvedValue({
      id: 1,
      username: 'admin',
      role: 'admin',
      balance: 250.5,
      created_at: '2026-09-28T09:00:00.000Z',
      token: 'signed.jwt.token',
    });
    renderApp();

    await user.type(screen.getByLabelText(/username/i), 'admin');
    await user.type(screen.getByLabelText(/password/i), 'admin12345');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith({ username: 'admin', password: 'admin12345' });
    });
    expect(await screen.findByRole('heading', { name: /wallet overview/i })).toBeInTheDocument();
    expect(window.localStorage.getItem('wallet.session')).toContain('signed.jwt.token');
  });

  it('shows the API message when the credentials are rejected', async () => {
    const user = userEvent.setup();
    loginMock.mockRejectedValue(new ApiError('Invalid username or password.', 401, 'UNAUTHORIZED'));
    renderApp();

    await user.type(screen.getByLabelText(/username/i), 'admin');
    await user.type(screen.getByLabelText(/password/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid username or password.');
    expect(window.localStorage.getItem('wallet.session')).toBeNull();
  });

  it('redirects straight to the dashboard when a session already exists', async () => {
    window.localStorage.setItem(
      'wallet.session',
      JSON.stringify({
        token: 'signed.jwt.token',
        user: { id: 1, username: 'admin', role: 'admin', balance: 0, created_at: '2026-09-28T09:00:00.000Z' },
      }),
    );

    renderApp();

    expect(await screen.findByRole('heading', { name: /wallet overview/i })).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });
});
