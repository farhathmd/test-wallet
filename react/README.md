# Wallet Admin Dashboard

React 19 + TypeScript + Vite front end for the [wallet API](../api/README.md): sign in (or create a
wallet), read the balance, move money with a top-up or a transfer, review the transaction ledger with
search and filters, and look at the same data as charts.

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
(`admin` / `admin12345` with the provided `.env.example`). A fresh wallet can also be created at
<http://localhost:5173/register>.

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on 5173 (strict port, so the API's CORS origin always matches) |
| `npm run build` | Type check (`tsc --noEmit`) then production bundle into `dist/` |
| `npm run preview` | Serves the built bundle on 4173 |
| `npm test` | Vitest run — 49 tests |
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

**Register** (`/register`) — creates a wallet via `POST /register` and signs it in immediately, because
the API returns a token from `/register` exactly as it does from `/login`. This form requires a
password even though the API allows omitting it: a password-less account could never be signed into
again here (login needs both fields), so the permissive option would produce a wallet the browser can
only reach once. A taken username comes back as the API's 409 message.

**Top up** (`/topup`) — `POST /topup` with the amount parsed from the input. The endpoint has no target
parameter by design (the token decides whose wallet moves) and answers 204, so the page reads
`GET /balance` back to confirm the new figure.

**Transfer** (`/transfer`) — `POST /transfer` with `{ to_username, amount }`. Recipient suggestions come
from `GET /users/top` minus the signed-in user (offering your own name would invite the one transfer the
API always rejects); the field stays free text, since the names are hints rather than a whitelist.

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

Because `/topup` and `/transfer` are their own routes, the overview unmounts while you are on them and
refetches the balance and the ledger when you come back — there is no shared cache to invalidate after a
write.

**Dark / light theme** — a toggle sits in the header of every signed-in screen and in the corner of
`/login` and `/register`. It sets `data-theme` on `<html>` and remembers the choice as `wallet.theme`;
with nothing stored yet it starts from the OS `prefers-color-scheme`. The entire palette is declared in
`styles.css`, so no component branches on the theme — the one exception is the charts, whose canvas
cannot read a CSS variable and takes its colours from a per-theme palette in `charts/options.ts`.

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
│   │   ├── session.ts      the session in localStorage (the theme keeps its own key)
│   │   ├── auth.api.ts     POST /login, POST /register
│   │   └── wallet.api.ts   balance, rankings, the paginated ledger, POST /topup, POST /transfer
│   ├── charts/         register.ts (tree-shaken Chart.js) + options.ts (pure data/option builders)
│   ├── components/     small, single-purpose presentational pieces (table, cards, filters, charts, toggle)
│   ├── context/        AuthContext (session, login, register, logout, auto sign-out on 401),
│   │                   ThemeContext (dark/light, persisted, applied to <html>)
│   ├── hooks/          useApiResource, useDebouncedValue, useWalletData, useFormSubmit
│   ├── pages/          LoginPage, RegisterPage, DashboardPage, TopupPage, TransferPage, NotFoundPage
│   ├── tests/          setup + format-and-charts, wallet-api, login, register, wallet-actions,
│   │                   dashboard, theme
│   ├── theme/theme.ts  the only module that touches the theme in localStorage
│   └── utils/format.ts pure currency/date/label formatting
└── vite.config.ts      Vite + Vitest configuration
```

Routes:

| Path | Access | Screen |
| --- | --- | --- |
| `/login` | public | sign in |
| `/register` | public | create a wallet and sign in |
| `/` | session | overview: cards, charts, ledger |
| `/topup` | session | add funds to your own wallet |
| `/transfer` | session | send funds to another username |
| `*` | — | "page not found" |

Rules the codebase follows:

* **Components render; hooks fetch; `api/` talks HTTP.** No component calls Axios directly, and no URL
  is built by hand outside `api/`.
* **Presentation logic is pure.** Chart data and formatting live in `charts/options.ts` and
  `utils/format.ts` and are unit tested without a browser; the components are thin wrappers.
* **One place per concern.** Token attachment and 401 handling happen in one interceptor; the session
  lives in one module; `useApiResource` owns loading/error/reload for every panel, and `useFormSubmit`
  owns submitting/error/result for every write.
* **The API owns the validation.** Forms check only that a field is filled in; amounts, usernames,
  password lengths and business refusals (insufficient balance, unknown recipient, taken username) come
  back as the API's message and are rendered verbatim, so the rules cannot drift between the two sides.

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
* **The theme is one attribute, not a class per element.** `ThemeContext` writes `data-theme` on
  `<html>` in a *layout* effect (so React has painted nothing yet and a dark-mode visitor never sees a
  light flash), and `styles.css` re-points the same variables under `[data-theme='dark']`. Only an
  explicit toggle is persisted, which leaves `prefers-color-scheme` free to seed the next visit until
  someone chooses. The cost is that Chart.js cannot read a CSS variable, hence the small palette passed
  into the chart builders and options.
* **Amounts are parsed once, at the HTTP boundary.** The API's DTO requires a JSON *number* and answers
  `"amount" must be a finite number.` for the string `"250.00"` — a mismatch that only a request against
  a live API exposes, so `wallet.api.ts` parses the typed text with `toAmount` and the pages pass the
  text through untouched. Blank input throws `Enter an amount.` there rather than relying on `Number('')`,
  which is `0`. The money rules themselves (greater than 0, less than 10,000,000, at most two decimals)
  stay in the API and are never copied into the browser; a rejected amount shows the API's message.
* **Writes answer 204, so the balance is read back.** A `POST` that returns no body cannot confirm
  anything, so both money screens call `GET /balance` after a successful write and show the figure the
  API reports — which is also the only way to know it.
* **Known limitations:** the bundle is ~166 kB gzipped, mostly Chart.js — lazy-loading the charts
  (dynamic `import()`) is the obvious next optimisation if first paint matters; there is no route-level
  code splitting (the screens are small and the charts dominate the bundle anyway); `/register` is open
  to anyone who can reach the API (the API has no rate limiting or
  CAPTCHA — locking registration down, or moving it behind an admin route, is a server-side decision);
  the transfer recipient suggestions come from the top-50 users, so a name outside that list must be
  typed in full.

## Testing

```bash
npm test          # 49 tests, ~7 s
```

| Suite | Covers |
| --- | --- |
| `src/tests/format-and-charts.test.ts` | money/date/label formatting, page descriptions, chart builders (signed → absolute values, colours, the dark palette, empty data) |
| `src/tests/wallet-api.test.ts` | the HTTP boundary itself: the request bodies (`{"amount":250}`, not `"250.00"`; `to_username`), the amount parse including blank and non-numeric input, the `limit` used for the suggestion list |
| `src/tests/login.test.tsx` | login through the real router and auth context: validation, error message, session persistence, redirect for an existing session, and the theme toggle being reachable before there is a session |
| `src/tests/register.test.tsx` | sign-up: empty fields send nothing, a 201 stores the session and lands on the overview, a 409 stays on the form with the API's message, the link from `/login`, and the redirect for a signed-in visitor |
| `src/tests/wallet-actions.test.tsx` | top-up and transfer: the exact request body (`to_username` included), no request for an empty form, the API's message for a rejected amount / low balance, the balance read after the 204, recipient suggestions excluding yourself, the header links, and the guard on a direct visit without a session |
| `src/tests/dashboard.test.tsx` | cards, table rendering (including the derived sign), paging, debounced search, admin-only filter, the header theme toggle, empty and error states with retry |
| `src/tests/theme.test.tsx` | the initial theme (stored → OS preference → light), a bad stored value, and that the toggle updates `<html data-theme>` and `wallet.theme` |

Only `api/auth.api` and `api/wallet.api` are mocked, so the screen tests exercise the code we wrote:
components, hooks, context, routing. The exceptions are `wallet-api.test.ts`, which mocks `api/client`
one level lower on purpose to see the request bodies, and the chart components, which render a stub —
which is why the builders are tested separately.

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

