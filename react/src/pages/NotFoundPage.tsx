import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="login">
      <section className="card login__card">
        <h1>Page not found</h1>
        <p>That route does not exist in the dashboard.</p>
        <Link className="button button--primary" to="/">
          Back to the wallet overview
        </Link>
      </section>
    </div>
  );
}
