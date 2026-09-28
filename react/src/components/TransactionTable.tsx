import { formatAmount, formatDateTime } from '../utils/format';

/**
 * The transaction table.
 *
 * Amounts are signed (`+` money in, `−` money out) because that is how the API reports them, and the
 * direction column repeats it in words, so colour is never the only signal.
 */
export interface TransactionTableRow {
  id: number;
  type: string;
  direction: string;
  counterparty: string | null;
  amount: number;
  created_at: string;
}

export function TransactionTable({
  rows,
  counterpartyHeading = 'Counterparty',
}: {
  rows: TransactionTableRow[];
  counterpartyHeading?: string;
}) {
  return (
    <div className="table-wrapper">
      <table className="table">
        <caption className="table__caption">
          {rows.length} transaction{rows.length === 1 ? '' : 's'} on this page
        </caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Type</th>
            <th scope="col">Direction</th>
            <th scope="col">{counterpartyHeading}</th>
            <th scope="col" className="table__amount-header">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isCredit = row.direction === 'credit';
            // GET /transactions returns the stored (positive) amount plus a direction, so the sign the
            // user sees is derived here rather than guessed from the number.
            const signedAmount = isCredit ? row.amount : -row.amount;
            return (
              <tr key={row.id}>
                <td>
                  <time dateTime={row.created_at}>{formatDateTime(row.created_at)}</time>
                </td>
                <td>
                  <span className={`badge badge--${row.type}`}>
                    {row.type === 'topup' ? 'Top-up' : 'Transfer'}
                  </span>
                </td>
                <td>
                  <span className={`direction direction--${isCredit ? 'credit' : 'debit'}`}>
                    {isCredit ? 'Money in' : 'Money out'}
                  </span>
                </td>
                <td>{row.counterparty ?? '—'}</td>
                <td className={`table__amount ${isCredit ? 'amount--credit' : 'amount--debit'}`}>
                  {formatAmount(signedAmount, { withSign: true })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
