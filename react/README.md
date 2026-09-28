# Wallet Admin Dashboard

React 19 + TypeScript + Vite front end for the [wallet API](../api/README.md): sign in, read the
balance, review the transaction ledger with search and filters, and look at the same data as charts.

- **Stack:** Vite 8, React 19, TypeScript 5.9, Axios, Chart.js 4 (`react-chartjs-2`), React Router 7
- **Tests:** Vitest + Testing Library (jsdom) — component behaviour with the network layer faked
- **No UI framework:** the dashboard is one screen, so ~8 small components and one stylesheet beat a
  component library in bundle size and in readability

---

## Quick start

```bash
# 1. API (see ../api/README.md)
cd ../api && npm run dev            # http://localhost:4000

# 2. Dashboard
cd ../react
cp .env.example .env                # VITE_API_URL=http://localhost:4000/api/v1
npm install
npm run dev                         # http://localhost:5173
```

Sign in with the credentials the API seeded: `ADMIN_USERNAME` / `ADMIN_PASSWORD` from `api/.env`
(`admin` / `admin12345` with the provided `.env.example`).

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on 5173 (strict port, so the API's CORS origin always matches) |
| `npm run build` | Type check (`tsc --noEmit`) then production bundle into `dist/` |
| `npm run preview` | Serves the built bundle on 4173 |
| `npm test` | Vitest run — 19 tests |
| `npm run test:watch` | Vitest in watch mode |
| `npm run typecheck` | Types only |

### Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:4000/api/v1` | Base URL of the wallet API (baked in at build time) |

Because it is baked in at build time, a deployed build must be created with the public API URL:
`VITE_API_URL=https://api.example.com/api/v1 npm run build`.

---

## What the dashboard does

**Login** (`/login`) — username + password form. Empty fields are caught locally; anything else comes
from the API, whose message is shown verbatim (for example "Invalid username or password."). On
success the token and user are stored and the user is taken to the dashboard (or back to the page they
originally asked for).

**Dashboard** (`/`)

| Area | Source |
| --- | --- |
| Balance card | `GET /balance` |
| Money in / Money out / Net movement cards | `summary` of the current `GET /transactions` result, so they follow the active filters |
| "Top transactions by value" bar chart | `GET /transactions/top` (10 largest, green = in, red = out) |
| "Money in vs money out" doughnut | the same filtered `summary` |
| "Top users by value transacted" bar chart | `GET /users/top` |
| Transactions table | `GET /transactions` with page, search and filters |
| Cross-wallet filter | `GET /transactions?username=…`, visible to admins only |

Filters: counterparty search (debounced), type (transfer/top-up), direction (money in/out), date range,
and — for admins — another user's wallet. The table shows the date, type, direction, counterparty and a
signed amount (`+$/…`, `−$/…`), and pages forward/back with a "1–10 of 42" description.

Every remote panel has three visible states, not one: a spinner while loading, an error banner with a
**Try again** button when a request fails, and an explicit empty state instead of a blank chart.

### How the sign is shown

`GET /transactions/top` returns **signed** amounts (debits negative), while `GET /transactions`
returns the stored **positive** amount plus a `direction` field. The table derives the sign from
`direction`, so a debit is always rendered as money out — this is asserted in the tests.

## Code map

```
react/
├── src/
│   ├── api/            client (Axios + interceptors), session storage, typed API calls and types
│   │   ├── client.ts       attaches the token, converts every failure into an ApiError
│   │   ├── session.ts      the only module that touches localStorage
│   │   ├── auth.api.ts     POST /login, POST /register
│   │   └── wallet.api.ts   balance, rankings and the paginated ledger
│   ├── charts/         register.ts (tree-shaken Chart.js) + options.ts (pure data/option builders)
│   ├── components/     small, single-purpose presentational pieces (table, cards, filters, charts)
│   ├── context/        AuthContext: session state, login, logout, auto sign-out on 401
│   ├── hooks/          useApiResource, useDebouncedValue, useWalletData
│   ├── pages/          LoginPage, DashboardPage, NotFoundPage
│   ├── tests/          setup + format-and-charts, login and dashboard test suites
│   └── utils/format.ts pure currency/date/label formatting
└── vite.config.ts      Vite + Vitest configuration
```

Rules the codebase follows:

* **Components render; hooks fetch; `api/` talks HTTP.** No component calls Axios directly, and no URL
  is built by hand outside `api/`.
* **Presentation logic is pure.** Chart data and formatting live in `charts/options.ts` and
  `utils/format.ts` and are unit tested without a browser; the components are thin wrappers.
* **One place per concern.** Token attachment and 401 handling happen in one interceptor; the session
  lives in one module; `useApiResource` owns loading/error/reload for every panel.

## Design decisions worth knowing

* **Axios instance in one file.** A request interceptor attaches `Authorization: Bearer <token>`; a
  response interceptor turns any failure into an `ApiError { message, status, code }` and, on a 401 for
  a request that *had* a token, clears the session and fires `wallet:session-expired`. The auth context
  listens for that event, so an expired token drops the user back to the login screen from anywhere.
  A 401 from `/login` is left alone — that one means "wrong password".
* **Session in `localStorage`, not memory.** A page reload keeps you signed in (nice for a dashboard)
  at the cost of XSS exposure. The mitigation that matters is not storing anything else sensitive and
  expiring tokens server-side; if the API were used for anything more sensitive, an httpOnly cookie
  plus a CSRF token would be the better trade.
* **`useApiResource` keeps previous data while refetching**, so filtering the table does not blank the
  screen, and it cancels stale updates so an out-of-order response cannot overwrite newer data.
* **Search is debounced (350 ms)** and every filter change resets to page 1 — a filter that lands on
  page 7 of the previous result set is never what the user meant.
* **Charts are data + options builders, not components.** The interesting logic (colours by direction,
  absolute bars for mixed signs, index axes) is testable without a canvas; tests mock
  `react-chartjs-2` and assert the data that reaches each chart.
* **Known limitations:** the bundle is ~165 kB gzipped, mostly Chart.js — lazy-loading the charts
  (dynamic `import()`) is the obvious next optimisation if first paint matters; the dashboard has no
  dark mode; there is no route-level code splitting because there is one route.

## Testing

```bash
npm test          # 19 tests, ~2 s
```

| Suite | Covers |
| --- | --- |
| `src/tests/format-and-charts.test.ts` | money/date/label formatting, page descriptions, chart builders (signed → absolute values, colours, empty data) |
| `src/tests/login.test.tsx` | login through the real router and auth context: validation, error message, session persistence, redirect for an existing session |
| `src/tests/dashboard.test.tsx` | cards, table rendering (including the derived sign), paging, debounced search, admin-only filter, empty and error states with retry |

Only `api/auth.api` and `api/wallet.api` are mocked, so the tests exercise the code we wrote:
components, hooks, context, routing. The chart components render a stub, which is why the builders are
tested separately.

## Docker and deployment

```bash
# Container: builds the bundle and serves it with nginx (SPA fallback for client-side routes)
docker build -t wallet-dashboard --build-arg VITE_API_URL=http://localhost:4000/api/v1 ./react
docker run --rm -p 5173:80 wallet-dashboard
```

From the repository root, `docker compose up --build` builds all three services (PostgreSQL, API,
dashboard) and wires the dashboard to the API automatically — the API URL is passed as a build arg, so
the browser gets an address it can actually reach.

For a static host (Vercel, Netlify, S3 + CloudFront), publish `dist/` and make sure two things are
configured:

1. `VITE_API_URL` must point at the deployed API at build time, and
2. the host must rewrite unknown paths to `/index.html`, otherwise a refresh on `/login` returns 404
   (nginx.conf in this folder shows the rule).

