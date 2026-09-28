import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { toApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';

/**
 * Login page.
 *
 * The dashboard needs a username and password (the wallet API also allows registering by username
 * only, which is not what an admin dashboard does). Validation is intentionally minimal here — the
 * server owns the rules — but empty fields and a pending request are handled so the form never feels
 * broken, and the API's own message ("Invalid username or password.") is shown verbatim.
 */
export function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/';

  if (isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (username.trim() === '' || password === '') {
      setError('Enter both your username and your password.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await login({ username: username.trim(), password });
      navigate(redirectTo, { replace: true });
    } catch (caught) {
      setError(toApiError(caught).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login">
      <section className="card login__card">
        <header className="login__header">
          <span className="brand__mark brand__mark--large" aria-hidden="true">
            ◈
          </span>
          <h1>Wallet Admin</h1>
          <p>Sign in to review balances, transfers and the transaction ledger.</p>
        </header>

        <form className="login__form" onSubmit={handleSubmit} noValidate>
          <div className="filters__field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              autoFocus
              required
              minLength={3}
              maxLength={32}
              value={username}
              disabled={submitting}
              onChange={(event) => setUsername(event.target.value)}
            />
          </div>

          <div className="filters__field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              value={password}
              disabled={submitting}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {error ? (
            <p className="login__error" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className="button button--primary" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="login__hint">
          Credentials come from the API environment: <code>ADMIN_USERNAME</code> /{' '}
          <code>ADMIN_PASSWORD</code> in <code>api/.env</code> (defaults in <code>.env.example</code>:
          admin / admin12345).
        </p>
      </section>
    </div>
  );
}
