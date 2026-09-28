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
cd api   && npm test                          # unit tests, no database required
cd api   && npm run test:integration          # integration tests (creates wallet_test automatically)
cd react && npm test                          # component/unit tests
```

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
