import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Page shell: brand, the signed-in wallet, and sign-out.
 *
 * Layout is deliberately part of the app (not a UI library): the whole dashboard is one page, so a
 * header plus a content area is all the structure it needs.
 */
export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="layout">
      <header className="layout__header">
        <Link to="/" className="brand">
          <span className="brand__mark" aria-hidden="true">
            ◈
          </span>
          <span>
            <strong>Wallet Admin</strong>
            <small>Crypto wallet API dashboard</small>
          </span>
        </Link>

        {user ? (
          <div className="layout__user">
            <span className="layout__identity">
              <strong>{user.username}</strong>
              <span className={`badge badge--role-${user.role}`}>{user.role}</span>
            </span>
            <button type="button" className="button button--ghost" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        ) : null}
      </header>

      <main className="layout__main">{children}</main>

      <footer className="layout__footer">
        <span>
          API: <code>{import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1'}</code>
        </span>
      </footer>
    </div>
  );
}
