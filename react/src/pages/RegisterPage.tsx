import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import type { ApiUser } from '../api/types';
import { useAuth } from '../context/AuthContext';
import { useFormSubmit } from '../hooks/useFormSubmit';

/**
 * Register page — creates a wallet and signs it in.
 *
 * The API also accepts a username with no password, but this form asks for one: an account without a
 * password could never be signed into again here (login requires both fields), so the permissive API
 * option would create a wallet the browser can only reach once, immediately after creating it.
 *
 * The API owns the rules (username 3–32 characters, password at least 8, username taken → 409 and its
 * message is shown verbatim). The only checks here are the ones that would otherwise cost a round trip
 * on an obviously empty form.
 */
export function RegisterPage() {
  const { register, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const form = useFormSubmit<ApiUser>();

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const created = await form.submit(async () => {
      if (username.trim() === '' || password === '') {
        throw new Error('Choose a username and a password.');
      }
      return register({ username: username.trim(), password });
    });

    // 201 comes back with a token exactly like /login, so the new wallet is already signed in.
    if (created) {
      navigate('/', { replace: true });
    }
  };

  return (
    <div className="login">
      <section className="card login__card">
        <header className="login__header">
          <span className="brand__mark brand__mark--large" aria-hidden="true">
            ◈
          </span>
          <h1>Create a wallet</h1>
          <p>Register a username and a password. The new wallet starts at 0.00.</p>
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
              disabled={form.submitting}
              onChange={(event) => setUsername(event.target.value)}
            />
          </div>

          <div className="filters__field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              disabled={form.submitting}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {form.error ? (
            <p className="login__error" role="alert">
              {form.error}
            </p>
          ) : null}

          <button type="submit" className="button button--primary" disabled={form.submitting}>
            {form.submitting ? 'Creating…' : 'Create wallet'}
          </button>
        </form>

        <p className="login__hint">
          Already have a wallet? <Link to="/login">Sign in</Link>.
        </p>
      </section>
    </div>
  );
}
