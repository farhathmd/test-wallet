/** API contract types. They mirror the JSON the wallet API returns (see api/README.md). */

export type Role = 'user' | 'admin';
export type TransactionType = 'topup' | 'transfer';
export type Direction = 'credit' | 'debit';

/** A wallet user as returned by /register and /login. */
export interface ApiUser {
  id: number;
  username: string;
  role: Role;
  balance: number;
  created_at: string;
}

/** /register and /login add the bearer token to the user payload. */
export interface AuthenticatedUser extends ApiUser {
  token: string;
}

/** GET /balance */
export interface BalanceResponse {
  balance: number;
}

/** GET /transactions/top — debits are negative. */
export interface TopTransaction {
  username: string;
  amount: number;
}

/** GET /users/top */
export interface TopUser {
  username: string;
  transacted_value: number;
}

/** One row of GET /transactions. */
export interface TransactionRow {
  id: number;
  type: TransactionType;
  direction: Direction;
  /** The other wallet, or null for a topup (no counterparty). */
  counterparty: string | null;
  amount: number;
  created_at: string;
}

/** Totals for the whole filtered set (not just the visible page). */
export interface TransactionSummary {
  credit_total: number;
  debit_total: number;
  net: number;
}

/** GET /transactions */
export interface TransactionPage {
  data: TransactionRow[];
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
  summary: TransactionSummary;
}

/** Query parameters the dashboard can send to GET /transactions. */
export interface TransactionQuery {
  page: number;
  per_page: number;
  q?: string;
  type?: TransactionType | '';
  direction?: Direction | '';
  /** YYYY-MM-DD, inclusive. */
  from?: string;
  /** YYYY-MM-DD, inclusive. */
  to?: string;
  /** Admin only: inspect another wallet. */
  username?: string;
}

/** The error envelope every failing request uses. */
export interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
}

/** The signed-in session, persisted in localStorage. */
export interface Session {
  token: string;
  user: ApiUser;
}
