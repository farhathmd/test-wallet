# Crypto Wallet — Admin Dashboard Monorepo

A cryptocurrency wallet service with an admin dashboard, delivered as two applications in one repository.

```
Test/
├── api/       Node.js 24 + NestJS 12 + Prisma 7 + PostgreSQL wallet REST API (JWT auth, unit + integration tests)
├── react/     React 19 + TypeScript + Vite admin dashboard (Axios, Chart.js, Vitest/RTL)
└── docker-compose.yml   PostgreSQL + API + built dashboard, one command to run everything
```

| App | Docs | Stack |
| --- | --- | --- |
| `api/` | [api/README.md](api/README.md) | Node.js, NestJS 12, Prisma 7 (`@prisma/adapter-pg`), PostgreSQL 16, Jest + supertest |
| `react/` | [react/README.md](react/README.md) | Vite, React 19, TypeScript, Axios, Chart.js, React Router, Vitest + Testing Library |

## Quick start (local development)

```bash
# 1. Database (Homebrew Postgres 16, or use docker compose instead)
brew services start postgresql@16
createdb wallet && createdb wallet_test

# 2. API  →  http://localhost:4000
cd api
cp .env.example .env          # fill in JWT_SECRET / ADMIN_PASSWORD
npm install
npm run migrate               # creates schema
npm run seed                  # creates the admin account used by the dashboard
npm run dev

# 3. Dashboard  →  http://localhost:5173
cd ../react
cp .env.example .env
npm install
npm run dev
```

Log in at <http://localhost:5173> with `ADMIN_USERNAME` / `ADMIN_PASSWORD` from `api/.env`
(defaults in `.env.example`: `admin` / `admin12345`).

## Quick start (Docker)

```bash
cd /path/to/Test                        # the compose file lives at the repository root
cp .env.example .env                    # then fill in the three secrets it lists
docker compose up -d --build --wait
# dashboard  → http://localhost:5173        (use 127.0.0.1 if a local dev server is on :5173)
# API        → http://localhost:4000/api/v1/health
# Postgres   → localhost:5433 on the host (5432 inside the compose network)
```

Generate the three secrets with `openssl rand -hex 16` (database), `-hex 32` (`JWT_SECRET`) and
`-hex 12` (admin password). Compose reads `./.env` and **refuses to start while any of them is empty**,
rather than falling back to a development default that would be committed to the compose file.

The API container runs migrations and seeds the admin account on boot, so the stack is ready to log
into immediately with the `ADMIN_USERNAME` / `ADMIN_PASSWORD` from `.env`. `--wait` blocks until every
health check passes — drop it for the detached version and follow the boot with
`docker compose logs -f api` instead. Containers are named `wallet-*` whatever the checkout folder is
called, and data lives in the `wallet_wallet-db` volume: `docker compose down -v` throws it away,
`docker compose down` keeps it.

`cd api && npm run smoke` against that stack runs the same 28 end-to-end checks the file-based
instructions use.

## Tests

```bash
cd api   && npm test                 # 106 unit tests, no database needed
cd api   && npm run test:integration #  50 integration tests (creates wallet_test automatically)
cd api   && npm run smoke            #  28 end-to-end checks against a running API
cd react && npm test                 #  19 dashboard tests
```

Everything was executed on this machine; see [Verification](#verification) for the exact commands and
results.

## What was built

| Requirement | Where |
| --- | --- |
| Register new users | `POST /api/v1/register` |
| Read balance | `GET /api/v1/balance` |
| Top up balance | `POST /api/v1/topup` |
| Transfer between wallets | `POST /api/v1/transfer` |
| Top N transactions by value per user | `GET /api/v1/transactions/top` |
| Overall top transacting users by value | `GET /api/v1/users/top` |
| Dashboard login with username + password | `POST /api/v1/login`, `/login` page |
| Paginated transaction list with search + filters | `GET /api/v1/transactions`, `/dashboard` page |
| Charts of transaction data | Chart.js bar / doughnut / horizontal bar on `/dashboard` |

See the per-app READMEs for the full API reference, architecture notes, and design decisions.

## Verification

Every command below was run on this machine (Node 24.18, PostgreSQL 16 via Homebrew, Docker 29) against
the code in this repository, in this order:

| # | Command | Result |
| --- | --- | --- |
| 1 | `cd api && npm test` | **106/106 unit tests pass**, ~3 s, no database required (Jest + ts-jest) |
| 2 | `cd api && npm run test:integration` | **50/50 integration tests pass** on real PostgreSQL (the `wallet_test` database is created and migrated automatically) |
| 3 | `cd api && npm run migrate && npm run seed` | Prisma migrations applied, admin account seeded (idempotent) |
| 4 | `cd api && npm run build && node dist/main.js` then `npm run smoke` | API boots on `:4000`, **28/28 documented behaviours verified over HTTP** |
| 5 | `cd api && npx tsc --noEmit` | type check clean for `src/` and `test/` |
| 6 | `docker build -t wallet-api ./api` + run against a `postgres:16-alpine` container | image builds, `prisma migrate deploy` runs on boot, `/api/v1/health` answers `{"status":"ok","db":"up"}`, register returns 201 |
| 7 | `cd react && npm test` | **19/19 dashboard tests pass** (login, table, filters, charts, states) |
| 8 | `cd react && npm run build` | type check clean, production bundle built (`dist/`, 165 kB gzipped) |
| 9 | `npm run preview` (4173) / `npm run dev` (5173) | bundle and dev server both serve the app; `/login` returns 200 (SPA fallback) |
| 10 | `curl -X OPTIONS` from the dashboard origin | CORS preflight answers 204 with the right `Access-Control-*` headers; an unknown origin gets no `Access-Control-Allow-Origin` |
| 11 | `docker compose up -d --build --wait` (repo root, project `wallet`, fresh volume, secrets from `.env`) | **3/3 containers healthy**, `restart: unless-stopped` on all three: `db` (`postgres:16-alpine`, host port 5433, `All migrations have been successfully applied`), `api` (admin seeded, `/api/v1/health` → 200, login with the `.env` admin password → 200, **the previous development password → 401**), `web` (nginx 1.27.5 on `localhost:5173`, bundle baked with the API URL, `/login` → 200); `npm run smoke` against the stack → **28/28**. With no `.env`, compose exits 1 with `required variable POSTGRES_PASSWORD is missing a value` instead of booting on a default secret |

What the smoke run covers end to end (against a live server, not a mock): health, register/login/duplicate
username, missing and invalid tokens, topup boundaries (`9,999,999.99` accepted, `10,000,000` and `1.005`
rejected), exact balance arithmetic, transfer to a differently-cased username, overdraft refused with
`INSUFFICIENT_BALANCE` and no balance change, self transfer and unknown recipient rejected, both rankings,
the paginated ledger with search/filters/date range, an empty result set, and the admin-only cross-wallet
view (200 for an admin, 403 for a normal user).

### Manual browser check (2 minutes)

The one thing a script cannot do is click around a real browser:

```bash
brew services start postgresql@16
cd api   && cp .env.example .env && npm install && npm run migrate && npm run seed && npm run dev
cd react && cp .env.example .env && npm install && npm run dev
```

Then open <http://localhost:5173>, sign in with `admin` / `admin12345`, and check: the balance and chart
cards load, the table lists transactions, searching by a counterparty filters it, paging works, and the
"Wallet (admin)" field appears because the signed-in account is an admin.

### Deploying a live URL

Nothing was deployed from this machine: there is no git remote configured, and the containers were run
locally only (Docker reached the daemon on this host, not a remote registry). The pieces are ready:

* **Whole stack in one command** — `cp .env.example .env`, fill in the three secrets, then
  `docker compose up -d --build --wait` starts PostgreSQL, the API (migrating and seeding on boot) and
  the nginx-served dashboard; verified end to end on this machine (see [Verification](#verification)).
  On a real host, the only other values that change are the two public origins:

  ```bash
  # in .env — VITE_API_URL is a build arg, so it needs `--build` to take effect
  CORS_ORIGIN=https://wallet.example.com
  VITE_API_URL=https://api.example.com/api/v1
  ```

  `CORS_ORIGIN` is what stops another site from calling the API with a logged-in browser, and the admin
  password is re-applied on every boot (the seeder upserts it), so rotating it is a config change plus a
  restart rather than a SQL statement. `docker compose build` produces the two production images —
  `wallet-api` and `wallet-web`, also tagged `wallet-api:prod` / `wallet-dashboard:prod` — which can be
  pushed to a registry and deployed on their own. The API image is ~860 MB because the Prisma CLI and
  its engines ship inside it: that is what lets the container apply migrations on boot.
* **API** — any Node host (Render, Railway, Fly.io, EC2): `npm ci --omit=dev && node dist/main.js`
  with `DATABASE_URL`, `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` set; the container image is in
  `api/Dockerfile`.
* **Dashboard** — any static host (Vercel, Netlify, S3): build with
  `VITE_API_URL=https://your-api/api/v1 npm run build` and publish `dist/`, remembering the
  rewrite-to-`index.html` rule in `react/nginx.conf`.
* Then point back at it: `API_URL=https://your-api/api/v1 ADMIN_PASSWORD=... npm run smoke` verifies the
  deployment.

To push this repository, create an empty remote and run:

```bash
git remote add origin <your-repo-url>   # then: git push -u origin main
```

## Repository layout

| Path | Contents |
| --- | --- |
| `api/` | NestJS API: config, domain rules, modules (auth/wallet/reporting/health), Prisma schema + migrations, tests, Dockerfile |
| `react/` | Vite dashboard: typed API client, hooks, components, pages, charts, tests, Dockerfile + nginx |
| `docker-compose.yml` | PostgreSQL + API + dashboard, with health checks and build args |
| `api/README.md`, `react/README.md` | API reference, architecture, design decisions, limitations |
