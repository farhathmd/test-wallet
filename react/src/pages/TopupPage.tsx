import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { fetchBalance, topup } from '../api/wallet.api';
import { useFormSubmit } from '../hooks/useFormSubmit';
import { formatAmount } from '../utils/format';

/**
 * Top up the signed-in wallet.
 *
 * `POST /topup` has no target parameter by design — the token decides whose wallet moves — and it
 * answers 204, so the page reads the balance back afterwards. That one extra `GET /balance` is both
 * the confirmation the user wants and the only way to know the new figure.
 *
 * The amount is parsed from the typed text into a number by the api layer (`toAmount`), because that is
 * what the API's contract requires. The rules (more than 0, less than 10,000,000, at most two decimals)
 * stay in the API and its messages are shown verbatim, so nothing here can drift out of sync with them.
 */
export function TopupPage() {
  const [amount, setAmount] = useState('');
  const amountId = useId();
  const form = useFormSubmit<number>();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await form.submit(async () => {
      if (amount.trim() === '') {
        throw new Error('Enter an amount to top up.');
      }
      await topup(amount.trim());
      return fetchBalance();
    });
  };

  return (
    <section className="card" aria-label="Top up">
      <header className="card__header">
        <h1>Top up</h1>
        <p>
          Adds funds to your own wallet. Amounts are validated by the API: more than 0, less than
          10,000,000, at most two decimal places.
        </p>
      </header>

      <form className="filters" onSubmit={handleSubmit} noValidate>
        <div className="filters__field">
          <label htmlFor={amountId}>Amount (USD)</label>
          <input
            id={amountId}
            name="amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="250.00"
            value={amount}
            disabled={form.submitting}
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>

        <div className="filters__actions">
          <button type="submit" className="button button--primary" disabled={form.submitting}>
            {form.submitting ? 'Topping up…' : 'Top up'}
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
            Topped up. New balance: <strong>{formatAmount(form.result)}</strong>.
          </span>
          <Link className="button button--ghost" to="/">
            View ledger
          </Link>
        </div>
      ) : null}
    </section>
  );
}
