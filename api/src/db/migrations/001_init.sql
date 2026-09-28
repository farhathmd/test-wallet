-- Wallet schema.
--
-- Design notes
-- * Balances live on the user row and are guarded by a CHECK constraint, so "balance is never
--   negative" is enforced by the database and not merely by application code.
-- * Money is NUMERIC(20,2): exact decimal arithmetic inside Postgres, never floating point.
-- * A transaction row is an immutable ledger entry: 'topup' (money entering the system, no sender)
--   or 'transfer' (user to user). Balances and ledger rows are always written in one transaction.
-- * username is stored normalised (lowercase) and is plain UNIQUE, which gives case-insensitive
--   uniqueness by construction.

CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  username      TEXT        NOT NULL CHECK (char_length(username) BETWEEN 3 AND 32),
  -- NULL means "token only account": registered without a password, so /login is not available.
  password_hash TEXT,
  role          TEXT        NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  balance       NUMERIC(20, 2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_username_key ON users (username);

CREATE TABLE transactions (
  id           BIGSERIAL PRIMARY KEY,
  type         TEXT          NOT NULL CHECK (type IN ('topup', 'transfer')),
  from_user_id BIGINT        REFERENCES users (id) ON DELETE CASCADE,
  to_user_id   BIGINT        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  amount       NUMERIC(20, 2) NOT NULL CHECK (amount > 0),
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  -- A transfer always has a sender; a topup never does.
  CONSTRAINT transactions_sender_required CHECK (
    (type = 'transfer' AND from_user_id IS NOT NULL) OR (type = 'topup' AND from_user_id IS NULL)
  ),
  CONSTRAINT transactions_parties_differ CHECK (from_user_id IS NULL OR from_user_id <> to_user_id)
);

-- Reporting reads the ledger from both sides ("my debits" and "my credits"), so both directions are
-- indexed with created_at for the paginated, time ordered listing.
CREATE INDEX transactions_from_user_created_idx ON transactions (from_user_id, created_at DESC);
CREATE INDEX transactions_to_user_created_idx ON transactions (to_user_id, created_at DESC);
-- Powers "top users by transacted value" (outbound only).
CREATE INDEX transactions_type_from_user_idx ON transactions (type, from_user_id);
