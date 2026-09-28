# Crypto Wallet API

NestJS + Prisma + PostgreSQL REST API for a simple crypto wallet: register a user, read a balance, top
up, transfer between wallets, and read the reporting data the admin dashboard needs.

The layering is deliberate: controllers only translate HTTP, services hold the rules, repositories own
the SQL, and money moves through PostgreSQL transactions with row locks — which is what makes the money
handling verifiable.

- **Runtime:** Node.js ≥ 22.9 (developed on Node 24), CommonJS output
- **Framework:** NestJS 12 (guards, pipes and the exception filter do the cross-cutting work)
- **Database:** PostgreSQL 16 through Prisma 7 (`prisma-client` generator + `@prisma/adapter-pg`)
- **Tests:** 156 tests — 106 unit tests (Jest, no database) and 50 integration tests (Jest + supertest
  against real PostgreSQL), plus a 28-check smoke script

---

## Quick start

```bash
brew services start postgresql@16     # or: docker compose up -d db  (from the repo root)
createdb wallet                       # the test database is created automatically by the tests

cd api
cp .env.example .env                  # set JWT_SECRET (openssl rand -hex 32) and ADMIN_PASSWORD
npm install                           # `prisma generate` runs on install
npm run migrate                       # applies prisma/migrations/* and records them in _prisma_migrations
npm run seed                          # creates/refreshes the admin account used by the dashboard
npm run dev                           # http://localhost:4000/api/v1
```

Changing the schema: edit `prisma/schema.prisma` and run `npm run prisma:migrate`
(`prisma migrate dev`), which writes a new SQL migration under `prisma/migrations/`. Deployments apply
them with `npm run migrate` (`prisma migrate deploy`).

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
| `npm start` | Runs the API (seeds the admin on boot), `nest start` |
| `npm run dev` | Same in watch mode (`nest start --watch`) |
| `npm run build` | Compiles to `dist/` (`nest build`) |
| `npm run migrate` | Applies pending Prisma migrations (`prisma migrate deploy`) |
| `npm run prisma:migrate` | Creates a migration from the current schema (`prisma migrate dev`) |
| `npm run seed` | Creates/refreshes the admin account only, without serving |
| `npm run typecheck` | `tsc --noEmit` over `src/` and `test/` |
| `npm test` | Unit tests — no database, ~3 s |
| `npm run test:integration` | Integration tests against real PostgreSQL (creates `wallet_test` if needed) |
| `npm run test:all` | Both suites |
| `npm run test:coverage` | Unit tests with coverage |
| `npm run smoke` | End-to-end checks against a running API (local or deployed) |

> `npm test` runs Jest with `--experimental-vm-modules`. NestJS 12 ships ESM-only packages, and this
> flag lets Jest's CommonJS module registry `require()` them; it is part of the script, not a manual step.

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
| 503 | `SERVICE_UNAVAILABLE` | `/health` only: API up, database unreachable |

Anything we raise deliberately is an `AppError` in `src/domain/errors.ts` and carries its own status and
code; everything else is treated as a bug and reported as a generic 500 (`AllExceptionsFilter`).

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

**Amount rules** (identical for topup and transfer, enforced in `src/domain/money.ts`):

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
├── prisma/
│   ├── schema.prisma      the data model, the indexes and the CHECK constraints' source of truth
│   └── migrations/        generated SQL, applied by `npm run migrate`
├── src/
│   ├── config/            configuration.ts (the only reader of process.env), config.module.ts, limits.ts
│   ├── domain/            errors.ts, money.ts, username.ts, password.ts, ledger.ts   ← pure rules, no I/O
│   ├── prisma/            prisma.service.ts (the client) and its global module
│   ├── repositories/      user.repository.ts, transaction.repository.ts  ← queries only
│   │                      unit-of-work.ts (transaction boundary), persistence.module.ts
│   ├── modules/
│   │   ├── auth/          service, controller, guards (JwtAuthGuard, RolesGuard), token + password
│   │   │                  services, admin-seeder.service.ts
│   │   ├── wallet/        wallet.service.ts (topup, transfer, balance), wallet.controller.ts
│   │   ├── reporting/     reporting.service.ts (rankings, paged ledger), reporting.controller.ts
│   │   └── health/        health.controller.ts — the database round trip an orchestrator needs
│   ├── http/
│   │   ├── dto/           parsers.ts + auth/wallet/reporting.dto.ts  ← incoming shape (the trust boundary)
│   │   ├── pipes/         request-parse.pipe.ts — wires a parser into a controller parameter
│   │   └── serializers/   outbound JSON shape (snake_case where the contract says so)
│   ├── common/            types.ts, decorators (@Public, @Roles, @CurrentUser), the exception filter
│   ├── testing/           in-memory repository doubles used by the unit tests
│   ├── app.module.ts      composition root
│   ├── bootstrap.ts       HTTP wiring (helmet, CORS, 16 kB body limit, prefix, filter) + startServer
│   ├── main.ts            process entry point
│   └── seed.ts            `npm run seed`
├── test/                  integration suite (jest-e2e.json, real PostgreSQL) + helpers
└── scripts/smoke.js       end-to-end verification against a running server
```

The request flow is one direction only:

```
HTTP → controller → dto parser (shape) → service (rules) → repository (SQL) → PostgreSQL
                                             ↘ unit of work (one transaction, row locks)
```

Dependencies point inwards. `domain/` imports nothing but other domain files; services never run
queries directly (repositories do); and only `app.module.ts`/`bootstrap.ts` know how the parts fit
together. That is what lets the unit tests exercise every rule with in-memory repositories, and the
integration tests run the real thing with no mocks at all.

Cross-cutting concerns are handled once, by Nest, rather than per route:

* **authentication is on by default** — `JwtAuthGuard` is registered as a global guard
  (`APP_GUARD` in `AuthModule`), so a new route is protected unless it explicitly says `@Public()`;
* **authorisation** — `RolesGuard` reads `@Roles(...)` metadata; the cross-wallet listing is the only
  rule that depends on the *parameter* rather than the route, so it lives in `ReportingService`;
* **errors** — `AllExceptionsFilter` is the single place that turns a thrown error into the documented
  `{ error: { code, message, details? } }` body, and the only place that decides what gets logged
  (5xx only: a 4xx is the caller's mistake and a degraded `/health` answer is a normal state);
* **request validation** — the `dto/` parsers, attached with `ParseRequest(...)`, reject malformed
  input as a 400 before any service or query runs.


### Data model

Prisma owns the schema (`prisma/schema.prisma`), mapped onto the same tables the API always had:

```
users                          transactions
─────                          ────────────
id          SERIAL PK          id           SERIAL PK
username    TEXT UNIQUE (3-32) type         'topup' | 'transfer'
password_hash TEXT NULL        from_user_id INT NULL  → users(id)
role        'user' | 'admin'   to_user_id   INT NOT NULL → users(id)
balance     NUMERIC(20,2)      amount       NUMERIC(20,2)  (must be > 0)
            CHECK (balance>=0) created_at   TIMESTAMPTZ
created_at / updated_at        CHECK: transfer has a sender, topup does not; sender ≠ recipient
```

* `balance NUMERIC(20,2) CHECK (balance >= 0)` and the ledger's own constraints are added by the
  migration (Prisma cannot express `CHECK`), so "a wallet is never negative" stays a database
  invariant rather than only application code.
* A ledger row is immutable and is written in the same transaction as the balance change.
* Indexes: `(from_user_id, created_at DESC)`, `(to_user_id, created_at DESC)` for the two sides of a
  wallet's history and `(type, from_user_id)` for the "top users" aggregate — the three access patterns
  the API actually has, and no more (declared as `@@index(...)` in the schema).
* Money is `Decimal @db.Decimal(20, 2)`: exact decimal arithmetic in PostgreSQL *and* in TypeScript,
  where Prisma hands over a `Decimal` (decimal.js) instead of a float.

### Concurrency and correctness

The interesting part of a wallet API is not the CRUD, it is making sure two simultaneous requests
cannot spend the same money:

1. **One transaction per operation** (`UnitOfWork.run`) — the balance update and the ledger insert
   commit together, or not at all.
2. **Row locks in a deterministic order** — `UserRepository.lockByIds` issues
   `SELECT ... FOR UPDATE ORDER BY id` before any balance is read. Ordering by id is what prevents the
   classic A→B / B→A deadlock: the pair is always locked lower id first, so one request simply waits.
3. **The database refuses to overdraw** — balances only change through
   `UPDATE users SET balance = balance + $delta` (`adjustBalance`, Prisma's `increment`), and
   `CHECK (balance >= 0)` rejects the statement if a later refactor ever bypassed the check in step 2.
4. **Exact decimal arithmetic** — amounts are validated as integer cents in the service,
   `NUMERIC(20,2)` in the database, `Decimal` in between.
5. **No query per row, ever** — the dashboard page, its total and its summary are three queries run
   concurrently; rankings are single grouped queries.


`test/concurrency.e2e-spec.ts` proves it: 10 parallel transfers of 30.00 against a 100.00 wallet
produce exactly 3 successes and 7 `INSUFFICIENT_BALANCE` answers, the balance ends at 10.00, no wallet
is ever negative, and every balance can be recomputed from the ledger alone. A second case fires
opposite-direction transfers at the same two wallets and asserts that nothing fails with a deadlock
error.

### Design decisions worth knowing

* **JWT is stateless.** Verification is one HMAC and no database round trip, so authenticated requests
  pay nothing extra and the API scales horizontally without shared session state. The trade-off is
  that a token cannot be revoked before it expires, so lifetime is configuration (`JWT_EXPIRES_IN`)
  rather than a constant. A `jti` denylist is the next step if "log out everywhere" becomes a
  requirement.
* **Authentication is deny-by-default.** The guard is global and routes opt out with `@Public()`, so a
  forgotten decorator on a new controller produces a 401 rather than an open endpoint.
* **The parsers are forms, not validators with a database.** Shape and format are checked before a
  service runs; anything that needs a query (does this user exist?) or business meaning (is this
  amount valid?) lives in the service, so each rule exists in exactly one place.
* **Repositories take the client as an argument.** `TransactionRepository.findPageForUser(args, db)`
  receives either the shared client or the transaction handle the caller is inside. That is how a
  service composes several statements into one atomic unit without the repository knowing about
  transactions.
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
* **Known limitations:** no rate limiting (put a reverse proxy or a Nest throttler at the edge — the
  login endpoint is the obvious candidate), no refresh tokens, no cursor pagination (offset paging is
  fine at this data size), and notifications are out of scope.

## Testing

```bash
npm test                     # 106 unit tests — no database, ~3 s
npm run test:integration     #  50 integration tests — real PostgreSQL
npm run smoke                #  28 checks against a running server
```

* **Unit tests** (`src/**/*.spec.ts`) run every domain rule and service path against in-memory
  repositories (`src/testing/fake-repositories.ts`) with no module wiring at all: amount bounds and
  decimal precision, duplicate usernames, unknown recipients, self transfers, insufficient funds,
  error mapping and logging, the request parsers, token handling (expired, tampered, foreign-signed,
  wrong algorithm) and the admin permission rule.
* **Integration tests** (`test/*.e2e-spec.ts`) boot the real application — the same `createApp()` the
  server uses, with real guards, real filters and real Prisma — against a real database: the
  documented status codes, registration and login, the 10,000,000 boundary, ledger/balance
  consistency, search, filters, pagination, the admin view and the concurrency proofs above. The
  `wallet_test` database is created and migrated automatically (`test/global-setup.ts`); point
  `TEST_DATABASE_URL` elsewhere when needed. `DATABASE_URL` is overridden for the run, so the suite can
  never touch a development database.

## Docker

```bash
docker build -t wallet-api ./api
docker run --rm -p 4000:4000 \
  -e DATABASE_URL=postgres://user:pass@host:5432/wallet \
  -e JWT_SECRET="$(openssl rand -hex 32)" \
  -e ADMIN_USERNAME=admin -e ADMIN_PASSWORD="$(openssl rand -hex 12)" \
  wallet-api
```

The image is a two-stage build: the first stage installs the toolchain, generates the Prisma client and
compiles to `dist/`, the second copies only what the runtime needs and drops privileges to the
unprivileged `node` user. It applies pending migrations (`prisma migrate deploy`) and then seeds the
admin account on boot, so a fresh database needs no manual step — which is also why `prisma` is a
production dependency. From the repository root, copy `.env.example` to `.env`, fill in the three secrets
it lists, and `docker compose up --build` starts PostgreSQL and this image together.



