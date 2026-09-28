# Crypto Wallet API

Node.js + Express 5 + PostgreSQL REST API for a simple crypto wallet: register a user, read a
balance, top up, transfer between wallets, and read the reporting data the admin dashboard needs.

Built as a plain Express application on purpose (no framework, no ORM): every query, index and lock
is visible in the repository that owns it, which is what makes the money handling verifiable.

- **Runtime:** Node.js ≥ 22.9 (developed on Node 24), ES modules
- **Database:** PostgreSQL 16
- **Dependencies:** `express`, `pg`, `jsonwebtoken`, `helmet`, `cors` — nothing else in production
- **Tests:** 152 tests (`node:test`), split into unit tests without a database and integration tests
  against real PostgreSQL

---

## Quick start

```bash
brew services start postgresql@16     # or: docker compose up -d db  (from the repo root)
createdb wallet                       # the test database is created automatically by the tests

cd api
cp .env.example .env                  # set JWT_SECRET (openssl rand -hex 32) and ADMIN_PASSWORD
npm install
npm run migrate                       # applies src/db/migrations/*.sql, tracks them in schema_migrations
npm run seed                          # creates/refreshes the admin account used by the dashboard
npm run dev                           # http://localhost:4000/api/v1
```

Verify an installation (or a deployment) end to end:

```bash
npm run smoke                                          # 28 checks against http://localhost:4000
API_URL=https://api.example.com/api/v1 ADMIN_PASSWORD=... npm run smoke
```

## Configuration

Everything is read from the environment (`.env` for local development); nothing sensitive is written
in the code. The API refuses to boot if a required variable is missing or obviously unsafe.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `NODE_ENV` | no | `development` | `production` enables production behaviour |
| `PORT` | no | `4000` | HTTP port |
| `DATABASE_URL` | **yes** | – | `postgres://user:pass@host:5432/wallet` |
| `DB_POOL_MAX` | no | `10` | Connection pool ceiling |
| `JWT_SECRET` | **yes** | – | Token signing key, **minimum 32 characters** (boot fails otherwise) |
| `JWT_EXPIRES_IN` | no | `7d` | Token lifetime (any `jsonwebtoken` duration) |
| `CORS_ORIGIN` | no | `http://localhost:5173` | Comma separated browser origins allowed to call the API (`*` for any) |
| `ADMIN_USERNAME` | **yes** | – | Account seeded/refreshed on every boot |
| `ADMIN_PASSWORD` | **yes** | – | Password for that account (stored only as a scrypt hash) |
| `TEST_DATABASE_URL` | no | `postgres://localhost:5432/wallet_test` | Used by `npm run test:integration` |

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Runs the API (migrates + seeds on boot), `--env-file-if-exists=.env` |
| `npm run dev` | Same with `node --watch` |
| `npm run migrate` | Applies pending SQL migrations only |
| `npm run seed` | Creates/refreshes the admin account only |
| `npm test` | Unit tests — no database, ~1 s |
| `npm run test:integration` | Integration tests against real PostgreSQL (creates `wallet_test` if needed) |
| `npm run test:all` | Both suites |
| `npm run test:coverage` | Unit tests with coverage from the Node test runner |
| `npm run smoke` | End-to-end checks against a running API (local or deployed) |

---

## API reference

Base URL: `http://localhost:4000/api/v1`

Authenticated endpoints expect `Authorization: Bearer <token>`; a bare token (`Authorization: <token>`)
and a `Token <token>` prefix are also accepted, and the JWT payload is `{ sub: <user id>, username, role }`.

### Errors

Every failure uses one shape, which keeps client error handling trivial:

```json
{ "error": { "code": "INSUFFICIENT_BALANCE", "message": "Insufficient balance: 100.00 available, 100.01 requested.",
             "details": { "balance": 100, "requested": 100.01 } } }
```

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Malformed body/query, amount out of bounds, > 2 decimals, unknown recipient for a filter value |
| 400 | `INSUFFICIENT_BALANCE` | The transfer exceeds the sender balance (`details` carries both numbers) |
| 401 | `UNAUTHORIZED` | Missing/invalid/expired token, or a wrong username/password on login |
| 403 | `FORBIDDEN` | Authenticated but not allowed (e.g. a non-admin asking for another wallet) |
| 404 | `NOT_FOUND` | Unknown recipient, unknown wallet, unknown route |
| 409 | `CONFLICT` | Username already taken |
| 413 | `PAYLOAD_TOO_LARGE` | Body above the 16 kB limit |
| 500 | `INTERNAL_ERROR` | Unexpected failure — logged with a stack, never exposed |
| 503 | – | `/health` only: API up, database unreachable |

### Authentication

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/register` | – | Create a wallet. Returns **201** with the user and a token. |
| `POST` | `/login` | – | Returns **200** with the user and a token. Requires a password. |

```bash
curl -s -X POST http://localhost:4000/api/v1/register -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"passw0rd!"}'
# 201 {"id":2,"username":"alice","role":"user","balance":0,"created_at":"...","token":"eyJhbGciOi..."}

curl -s -X POST http://localhost:4000/api/v1/login -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"passw0rd!"}'
```

Usernames are normalised to lower case and must match `[a-z0-9_.-]{3,32}` after trimming, so
`Alice` and `alice` are the same wallet (one plain `UNIQUE` constraint, no case-insensitive index
tricks). `password` is optional on `/register` — the wallet API is specified as "register by
username", so a client may create a token-only account; such an account simply cannot use `/login`.
When a password is supplied it must be 8–128 characters and is stored as a salted scrypt hash
(`scrypt$<salt>$<key>`), never in plain text.

Login answers with the same message and the same work for "unknown user" and "wrong password"
(a decoy hash is verified), so it cannot be used to probe which usernames exist.

### Wallet

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/balance` | token | **200** `{"balance":1234.56}` — balance of the token owner |
| `POST` | `/topup` | token | **204** — body `{"amount":1000.50}` |
| `POST` | `/transfer` | token | **204** — body `{"to_username":"bob","amount":250}` |

```bash
TOKEN=...
curl -s -X POST http://localhost:4000/api/v1/topup -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"amount":1000.50}' -i | head -1        # 204
curl -s http://localhost:4000/api/v1/balance -H "Authorization: Bearer $TOKEN"     # {"balance":1000.5}
curl -s -X POST http://localhost:4000/api/v1/transfer -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"to_username":"bob","amount":200.25}' -i | head -1  # 204
```

**Amount rules** (identical for topup and transfer, enforced in `src/domain/money.js`):

* a JSON **number**, strictly greater than `0` and strictly less than `10,000,000`
  (so `9,999,999.99` is accepted and `10,000,000` is rejected),
* at most **2 decimal places** — `1.005` is a 400, not a silently rounded value,
* transferred as integer cents internally, and as a decimal string to Postgres (`NUMERIC(20,2)`),
  so no balance can ever drift by a fraction of a cent.

**Transfer rules:** the recipient must exist (404), cannot be yourself (400), and the sender must
cover the amount (400 `INSUFFICIENT_BALANCE`, nothing is written). Transfers and topups are recorded
in a ledger (`transactions`) in the same database transaction that moves the balance, so a balance
and its ledger can never disagree.

### Reporting (what the dashboard reads)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/transactions/top?limit=10` | token | Top N transactions **by value** for the token owner |
| `GET` | `/users/top?limit=10` | token | Users ranked by total value they transacted, across all users |
| `GET` | `/transactions` | token | Paginated, searchable ledger of a wallet |
| `GET` | `/health` | – | Liveness/readiness, including a database round trip |

```bash
curl -s 'http://localhost:4000/api/v1/transactions/top?limit=10' -H "Authorization: Bearer $TOKEN"
# [{"username":"bob","amount":-200.25},{"username":"carol","amount":50}]

curl -s 'http://localhost:4000/api/v1/users/top?limit=10' -H "Authorization: Bearer $TOKEN"
# [{"username":"bob","transacted_value":225.5},{"username":"alice","transacted_value":150}]
```

* `/transactions/top` — top 10 by default, `limit` up to 50; **debits are returned as negative
  amounts** so the sign is visible on a chart, ordered by absolute value descending, ties broken by
  newest first. Topups have no counterparty and are therefore excluded. A user without transactions
  gets `[]`, not an error.
* `/users/top` — outbound transfers only, summed per user, `transacted_value` as the documented field
  name, ties broken by username for stable output.

### `GET /transactions`

| Query | Default | Meaning |
| --- | --- | --- |
| `page` | `1` | 1-based page number |
| `per_page` | `10` | Page size, max `100` |
| `q` | – | Case-insensitive partial match on the counterparty username (max 64 chars) |
| `type` | – | `topup` or `transfer` |
| `direction` | – | `credit` (money in) or `debit` (money out) — relative to the listed wallet |
| `from`, `to` | – | `YYYY-MM-DD`, both inclusive (UTC) |
| `username` | – | **admin only**: inspect that user's wallet instead of your own |

```json
{
  "data": [
    { "id": 12, "type": "transfer", "direction": "debit", "counterparty": "bob",
      "amount": 200.25, "created_at": "2026-09-28T09:12:44.101Z" },
    { "id": 4, "type": "topup", "direction": "credit", "counterparty": null,
      "amount": 1000.5, "created_at": "2026-09-28T09:10:02.550Z" }
  ],
  "page": 1, "per_page": 10, "total": 2, "total_pages": 1,
  "summary": { "credit_total": 1000.5, "debit_total": 200.25, "net": 800.25 }
}
```

`summary` aggregates the **whole filtered set**, not just the returned page, which is what the
dashboard cards need: three queries (page, count, summary) run concurrently, one per page — never one
query per row.

---

## Architecture

```
api/
├── src/
│   ├── config/            env.js (validated, the only reader of process.env), limits.js
│   ├── domain/            errors.js, money.js, username.js, password.js   ← pure rules, no I/O
│   ├── db/                pool.js, unit-of-work.js, migrate.js, seed-admin.js, migrations/*.sql
│   ├── repositories/      user.repository.js, transaction.repository.js    ← SQL only
│   ├── services/          auth / wallet / reporting / jwt / password       ← use cases
│   ├── http/
│   │   ├── validators/    request.js       ← shape of incoming requests (the trust boundary)
│   │   ├── controllers/   one file per resource, thin: validate → service → serialise
│   │   ├── middleware/    auth.js, error-handler.js
│   │   ├── serializers/   outbound JSON shape (snake_case where the contract says so)
│   │   └── routes/        the route table, versioned under /api/v1
│   ├── container.js       composition root: builds repositories, services, controllers
│   ├── app.js             Express wiring: security headers, CORS, JSON, routes, error handling
│   └── server.js          process entry point: config → migrate → seed → listen → graceful stop
├── scripts/smoke.js       end-to-end verification against a running server
└── tests/                 unit/ (fakes, no database) and integration/ (real PostgreSQL)
```

The request flow is one direction only:

```
HTTP → validator (shape) → controller (translate) → service (rules) → repository (SQL) → PostgreSQL
                                                        ↘ unit of work (one transaction)
```

Dependencies point inwards: `domain` imports nothing, `services` never import `express` or `pg`, and
only `container.js` and `server.js` know how the parts fit together. That is why the unit tests can
exercise all the business rules with in-memory repositories, and why the integration tests can run the
real thing without a single mock.

### Data model

```
users                          transactions
─────                          ────────────
id          BIGSERIAL PK       id           BIGSERIAL PK
username    TEXT UNIQUE (3-32) type         'topup' | 'transfer'
password_hash TEXT NULL        from_user_id BIGINT NULL  → users(id)
role        'user' | 'admin'   to_user_id   BIGINT NOT NULL → users(id)
balance     NUMERIC(20,2)      amount       NUMERIC(20,2)  (must be > 0)
            CHECK (balance>=0) created_at   TIMESTAMPTZ
created_at / updated_at        CHECK: transfer has a sender, topup does not; sender ≠ recipient
```

* `balance NUMERIC(20,2) CHECK (balance >= 0)` — "a wallet is never negative" is a database
  invariant, not just application code.
* A ledger row is immutable and is written in the same transaction as the balance change.
* Indexes: `(from_user_id, created_at DESC)`, `(to_user_id, created_at DESC)` for the two sides of a
  wallet's history and `(type, from_user_id)` for the "top users" aggregate — the three access
  patterns the API actually has, and no more.
* Migrations are plain SQL files applied in name order and recorded in `schema_migrations`, each in
  its own transaction and behind a Postgres advisory lock so two replicas cannot race on boot.

### Concurrency and correctness

The interesting part of a wallet API is not the CRUD, it is making sure two simultaneous requests
cannot spend the same money:

1. **One transaction per operation** (`db/unit-of-work.js`) — balance update and ledger insert commit
   together, or not at all.
2. **Row locks in a deterministic order** — a transfer locks both wallets with
   `SELECT ... FOR UPDATE ORDER BY id` before reading any balance. Ordering by id is what prevents the
   classic A→B / B→A deadlock (the pair always locks the lower id first, so one request simply waits).
3. **A guarded update as the last line of defence** — `UPDATE users SET balance = balance + $1
   WHERE id = $2 AND balance + $1::numeric >= 0`. Even if step 2 were bypassed by a later refactor,
   Postgres would refuse to overdraw, and `CHECK (balance >= 0)` would refuse again.
4. **Exact decimal arithmetic** — integer cents in the application, `NUMERIC(20,2)` in the database.
5. **No query per row, ever** — the dashboard page, its total and its summary are three queries run
   concurrently; rankings are single grouped queries.

`tests/integration/concurrency.test.js` proves it: 10 parallel transfers of 30.00 against a 100.00
wallet produce exactly 3 successes and 7 `INSUFFICIENT_BALANCE` answers, the balance ends at 10.00, no
wallet is ever negative, and every balance can be recomputed from the ledger alone. A second case
fires opposite-direction transfers at the same two wallets and asserts that nothing fails with a
deadlock error.

### Design decisions worth knowing

* **JWT is stateless.** Verification is one HMAC and no database round trip, so authenticated requests
  pay nothing extra and the API scales horizontally without shared session state. The trade-off is
  that a token cannot be revoked before it expires, so lifetime is configuration (`JWT_EXPIRES_IN`)
  rather than a constant. A `jti` denylist is the next step if "log out everywhere" becomes a
  requirement.
* **Topups are ledger entries too**, with `from_user_id = NULL`, so a wallet's history explains its
  balance exactly (`credits - debits = balance`, asserted in the test suite) instead of having an
  unexplained starting amount.
* **Usernames are normalised, not compared case-insensitively.** One plain `UNIQUE` column, no
  functional index, no surprises in lookups.
* **Listing scope:** `GET /transactions` reads the caller's own ledger, and `?username=<other>` is an
  admin escape hatch (403 for everyone else). This keeps `direction` and `counterparty` meaningful,
  since both are always relative to a single wallet, while still giving the dashboard an admin view.
* **The admin role gates the cross-wallet listing only**, because the specification defines every
  other endpoint as available to the wallet owner.
* **`/health` touches the database**, so an orchestrator stops routing traffic to an instance that
  cannot serve it.
* **Known limitations:** no rate limiting (put `express-rate-limit` or a reverse proxy at the edge —
  the login endpoint is the obvious candidate), no refresh tokens, no cursor pagination (offset paging
  is fine at this data size), and notifications are out of scope.

## Testing

```bash
npm test                     # 102 unit tests — no database, ~1 s
npm run test:integration     #  50 integration tests — real PostgreSQL
npm run smoke                #  28 checks against a running server
```

* **Unit tests** (`tests/unit/`) run every domain rule and service path against in-memory
  repositories (`tests/helpers/fake-repositories.js`): amount bounds and decimal precision, duplicate
  usernames, unknown recipients, self transfers, insufficient funds, error mapping, token handling
  (expired, tampered, foreign-signed, wrong algorithm) and the admin permission rule.
* **Integration tests** (`tests/integration/`) boot the real app through the real composition root on a
  real database: migrations, registration, login, the 10,000,000 boundary, ledger/balance consistency,
  search, filters, pagination, the admin view and the concurrency proofs above. The `wallet_test`
  database is created automatically; point `TEST_DATABASE_URL` elsewhere when needed.

## Docker

```bash
docker build -t wallet-api ./api
docker run --rm -p 4000:4000 \
  -e DATABASE_URL=postgres://user:pass@host:5432/wallet \
  -e JWT_SECRET="$(openssl rand -hex 32)" \
  -e ADMIN_USERNAME=admin -e ADMIN_PASSWORD=admin12345 \
  wallet-api
```

The image installs production dependencies only, runs as the unprivileged `node` user, and migrates
plus seeds on boot, so a fresh database needs no manual step. From the repository root,
`docker compose up --build` starts PostgreSQL and this image together.


