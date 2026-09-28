# Crypto Wallet — Admin Dashboard Monorepo

A cryptocurrency wallet service with an admin dashboard, delivered as two applications in one repository.

```
Test/
├── api/       Node.js 24 + Express 5 + PostgreSQL wallet REST API (JWT auth, unit + integration tests)
├── react/     React 19 + TypeScript + Vite admin dashboard (Axios, Chart.js, Vitest/RTL)
└── docker-compose.yml   PostgreSQL + API + built dashboard, one command to run everything
```

| App | Docs | Stack |
| --- | --- | --- |
| `api/` | [api/README.md](api/README.md) | Node.js (ESM), Express 5, `pg`, `jsonwebtoken`, PostgreSQL 16, `node:test` |
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
JWT_SECRET="a-very-long-development-secret-key-1234" docker compose up --build
# dashboard  → http://localhost:5173
# API        → http://localhost:4000/api/v1/health
```

The API container runs migrations and seeds the admin account on boot, so the stack is ready
to log into immediately.

## Tests

```bash
cd api   && npm test                 # 102 unit tests, no database needed
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

Every command below was run on this machine (Node 24.18, PostgreSQL 16 via Homebrew) against the code in
this repository, in this order:

| # | Command | Result |
| --- | --- | --- |
| 1 | `cd api && npm test` | **102/102 unit tests pass**, ~1.3 s, no database required |
| 2 | `cd api && npm run test:integration` | **50/50 integration tests pass** on real PostgreSQL (the `wallet_test` database was created automatically and migrated) |
| 3 | `cd api && npm run migrate && npm run seed` | schema created, admin account seeded (idempotent) |
| 4 | `cd api && npm run dev` then `npm run smoke` | API boots on `:4000`, **28/28 documented behaviours verified over HTTP** |
| 5 | `cd react && npm test` | **19/19 dashboard tests pass** (login, table, filters, charts, states) |
| 6 | `cd react && npm run build` | type check clean, production bundle built (`dist/`, 165 kB gzipped) |
| 7 | `npm run preview` (4173) / `npm run dev` (5173) | bundle and dev server both serve the app; `/login` returns 200 (SPA fallback) |
| 8 | `curl -X OPTIONS` from the dashboard origin | CORS preflight answers 204 with the right `Access-Control-*` headers; an unknown origin gets no `Access-Control-Allow-Origin` |

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

This machine has no Docker daemon running and no git remote configured, so nothing was deployed or
pushed from here:

* **Whole stack in one command** — `JWT_SECRET="$(openssl rand -hex 32)" docker compose up --build`
  starts PostgreSQL, the API (migrating and seeding on boot) and the nginx-served dashboard.
* **API** — any Node host (Render, Railway, Fly.io, EC2): `npm ci --omit=dev && node src/server.js`
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
| `api/` | Express API: config, domain rules, repositories, services, HTTP layer, SQL migrations, tests, Dockerfile |
| `react/` | Vite dashboard: typed API client, hooks, components, pages, charts, tests, Dockerfile + nginx |
| `docker-compose.yml` | PostgreSQL + API + dashboard, with health checks and build args |
| `api/README.md`, `react/README.md` | API reference, architecture, design decisions, limitations |
