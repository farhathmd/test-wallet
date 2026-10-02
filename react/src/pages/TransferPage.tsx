import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { fetchBalance, transfer } from '../api/wallet.api';
import { useAuth } from '../context/AuthContext';
import { useFormSubmit } from '../hooks/useFormSubmit';
import { useTopUsernames } from '../hooks/useWalletData';
import { formatAmount } from '../utils/format';

/**
 * Transfer from the signed-in wallet to another username.
 *
 * The sender is the token, so there is no "from" field to get wrong. `POST /transfer` answers 204, so
 * the balance is read back to show the result.
 *
 * Recipient suggestions come from `GET /users/top` (already on the dashboard) minus the current user:
 * offering your own username would invite the one transfer the API always rejects. The field stays a
 * free-text input — these are hints, not a whitelist.
 */
export function TransferPage() {
  const { user } = useAuth();
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const ids = { recipient: useId(), amount: useId(), suggestions: useId() };
  const suggestions = useTopUsernames();
  const form = useFormSubmit<number>();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await form.submit(async () => {
      const to = recipient.trim();
      if (to === '') {
        throw new Error('Enter the username to transfer to.');
      }
      if (amount.trim() === '') {
        throw new Error('Enter an amount to transfer.');
      }
      await transfer(to, amount.trim());
      return fetchBalance();
    });
  };

  return (
    <section className="card" aria-label="Transfer">
      <header className="card__header">
        <h1>Transfer</h1>
        <p>
          Moves funds from your wallet to another username. The recipient must already exist, the
          amount must be at most your balance, and the API rejects a transfer to yourself.
        </p>
      </header>

      <form className="filters" onSubmit={handleSubmit} noValidate>
        <div className="filters__field filters__field--wide">
          <label htmlFor={ids.recipient}>Recipient username</label>
          <input
            id={ids.recipient}
            name="to_username"
            type="text"
            autoComplete="off"
            placeholder="e.g. bob"
            maxLength={32}
            list={ids.suggestions}
            value={recipient}
            disabled={form.submitting}
            onChange={(event) => setRecipient(event.target.value)}
          />
          <datalist id={ids.suggestions}>
            {suggestions
              .filter((username) => username !== user?.username)
              .map((username) => (
                <option key={username} value={username} />
              ))}
          </datalist>
        </div>

        <div className="filters__field">
          <label htmlFor={ids.amount}>Amount (USD)</label>
          <input
            id={ids.amount}
            name="amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="25.50"
            value={amount}
            disabled={form.submitting}
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>

        <div className="filters__actions">
          <button type="submit" className="button button--primary" disabled={form.submitting}>
            {form.submitting ? 'Sending…' : 'Send transfer'}
          </button>
        </div>
      </form>

      {form.error ? (
        <p className="login__error" role="alert">
          {form.error}
        </p>
      ) : null}

      {/* `!== null`, not a truthiness check: a balance of 0 is a real answer. */}
      {form.result !== null ? (
        <div className="state state--success" role="status">
          <span>
            Transfer sent. New balance: <strong>{formatAmount(form.result)}</strong>.
          </span>
          <Link className="button button--ghost" to="/">
            View ledger
          </Link>
        </div>
      ) : null}
    </section>
  );
}
