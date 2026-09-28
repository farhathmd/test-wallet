#!/usr/bin/env node
/**
 * End-to-end smoke check against a running API — the script used to verify a deployment.
 *
 *   npm start                                    # or: docker compose up
 *   npm run smoke                                # verifies http://localhost:4000
 *   API_URL=https://api.example.com/api/v1 ADMIN_PASSWORD=... npm run smoke
 *
 * It walks the documented contract in order and prints one line per check: money rules, auth,
 * reporting and the admin view. Exits non-zero if anything is not as documented.
 */
const API_URL = (process.env.API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');
const ADMIN = {
  username: process.env.ADMIN_USERNAME ?? 'admin',
  password: process.env.ADMIN_PASSWORD ?? 'admin12345',
};
const stamp = Date.now().toString(36);
const alice = { username: `smoke_a_${stamp}`, password: 'passw0rd!' };
const bob = { username: `smoke_b_${stamp}`, password: 'passw0rd!' };

let checks = 0;
let failures = 0;

/**
 * @param {string} label
 * @param {boolean} condition
 * @param {unknown} [detail] printed when the check fails
 */
function check(label, condition, detail) {
  checks += 1;
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail === undefined ? '' : ` -> ${JSON.stringify(detail)}`}`);
  }
}

/**
 * @param {'GET'|'POST'} method
 * @param {string} path
 * @param {{ token?: string, body?: object }} [options]
 */
async function call(method, path, { token, body } = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

/** @param {{ username: string, password: string }} user */
async function register(user) {
  const { status, body } = await call('POST', '/register', { body: user });
  if (status !== 201) {
    throw new Error(`register ${user.username} -> ${status} ${JSON.stringify(body)}`);
  }
  return { token: body.token };
}

/** @param {{ token: string }} session */
const balanceOf = async (session) => (await call('GET', '/balance', { token: session.token })).body.balance;

async function main() {
  console.log(`Smoke testing ${API_URL}\n`);

  // --- health -----------------------------------------------------------------------------------
  const health = await call('GET', '/health');
  check('GET /health -> 200, database up', health.status === 200 && health.body.db === 'up', health.body);

  // --- registration, login and tokens ------------------------------------------------------------
  const aliceSession = await register(alice);
  const bobSession = await register(bob);
  check('POST /register -> 201 with a token', typeof aliceSession.token === 'string');

  const duplicate = await call('POST', '/register', {
    body: { username: alice.username.toUpperCase() },
  });
  check('POST /register (duplicate, any casing) -> 409', duplicate.status === 409, duplicate.body);

  const login = await call('POST', '/login', { body: alice });
  check('POST /login -> 200 with a token', login.status === 200 && !!login.body.token, login.body);

  const wrongPassword = await call('POST', '/login', {
    body: { username: alice.username, password: 'definitely-wrong' },
  });
  check('POST /login (wrong password) -> 401', wrongPassword.status === 401, wrongPassword.body);

  const anonymous = await call('GET', '/balance');
  check('GET /balance without a token -> 401', anonymous.status === 401, anonymous.body);

  // --- money rules ------------------------------------------------------------------------------
  const topup = await call('POST', '/topup', { token: aliceSession.token, body: { amount: 1000.5 } });
  check('POST /topup 1000.50 -> 204', topup.status === 204, topup.body);
  check('GET /balance -> 1000.5', (await balanceOf(aliceSession)) === 1000.5);

  const atLimit = await call('POST', '/topup', {
    token: aliceSession.token,
    body: { amount: 10_000_000 },
  });
  check('POST /topup 10,000,000 -> 400', atLimit.status === 400, atLimit.body);

  const belowLimit = await call('POST', '/topup', {
    token: aliceSession.token,
    body: { amount: 9_999_999.99 },
  });
  check('POST /topup 9,999,999.99 -> 204', belowLimit.status === 204, belowLimit.body);

  const tooPrecise = await call('POST', '/topup', { token: bobSession.token, body: { amount: 1.005 } });
  check('POST /topup (3 decimals) -> 400', tooPrecise.status === 400, tooPrecise.body);

  const zero = await call('POST', '/topup', { token: bobSession.token, body: { amount: 0 } });
  check('POST /topup 0 -> 400', zero.status === 400, zero.body);

  await call('POST', '/topup', { token: bobSession.token, body: { amount: 500 } });

  // --- transfers --------------------------------------------------------------------------------
  const transfer = await call('POST', '/transfer', {
    token: aliceSession.token,
    body: { to_username: bob.username.toUpperCase(), amount: 200.25 },
  });
  check('POST /transfer (recipient in any casing) -> 204', transfer.status === 204, transfer.body);

  const sender = await balanceOf(aliceSession);
  const recipient = await balanceOf(bobSession);
  const expectedSender = 1000.5 + 9_999_999.99 - 200.25; // both topups minus the transfer
  check(
    `balances moved exactly (${expectedSender} / 700.25)`,
    sender === expectedSender && recipient === 700.25,
    { sender, recipient },
  );

  const overdraft = await call('POST', '/transfer', {
    token: bobSession.token,
    body: { to_username: alice.username, amount: 700.26 },
  });
  check(
    'POST /transfer (more than the balance) -> 400 INSUFFICIENT_BALANCE',
    overdraft.status === 400 && overdraft.body.error.code === 'INSUFFICIENT_BALANCE',
    overdraft.body,
  );
  check('balance unchanged after a refused transfer', (await balanceOf(bobSession)) === 700.25);

  const self = await call('POST', '/transfer', {
    token: bobSession.token,
    body: { to_username: bob.username, amount: 1 },
  });
  check('POST /transfer (to self) -> 400', self.status === 400, self.body);

  const ghost = await call('POST', '/transfer', {
    token: bobSession.token,
    body: { to_username: `ghost_${stamp}`, amount: 1 },
  });
  check('POST /transfer (unknown recipient) -> 404', ghost.status === 404, ghost.body);

  await reportChecks(aliceSession);
}

/**
 * Reporting and admin checks, split out to keep `main` readable.
 * @param {{ token: string }} aliceSession
 */
async function reportChecks(aliceSession) {
  const top = await call('GET', '/transactions/top', { token: aliceSession.token });
  check(
    'GET /transactions/top -> debits negative, topups excluded',
    top.status === 200 && top.body.length === 1 && top.body[0].amount === -200.25,
    top.body,
  );

  const topUsers = await call('GET', '/users/top', { token: aliceSession.token });
  check(
    'GET /users/top -> ranked by value transacted, highest first',
    topUsers.status === 200 &&
      topUsers.body.some(
        (row) => row.username === alice.username && row.transacted_value === 200.25,
      ) &&
      topUsers.body.every(
        (row, index, all) => index === 0 || all[index - 1].transacted_value >= row.transacted_value,
      ),
    topUsers.body,
  );

  const listing = await call('GET', '/transactions?page=1&per_page=5', { token: aliceSession.token });
  check(
    'GET /transactions -> paged rows plus credit/debit summary',
    listing.status === 200 &&
      listing.body.total >= 3 &&
      typeof listing.body.summary.debit_total === 'number' &&
      listing.body.per_page === 5,
    listing.body,
  );

  const filtered = await call('GET', `/transactions?q=${bob.username}&direction=debit&type=transfer`, {
    token: aliceSession.token,
  });
  check(
    'GET /transactions?q=&direction=&type= filters',
    filtered.status === 200 && filtered.body.total === 1 && filtered.body.data[0].direction === 'debit',
    filtered.body,
  );

  const futureRange = await call(
    'GET',
    `/transactions?from=${new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}`,
    { token: aliceSession.token },
  );
  check(
    'GET /transactions (future range) -> empty page, not an error',
    futureRange.status === 200 && futureRange.body.total === 0 && futureRange.body.data.length === 0,
    futureRange.body,
  );

  const emptySession = await register({ username: `smoke_c_${stamp}`, password: 'passw0rd!' });
  const emptyTop = await call('GET', '/transactions/top', { token: emptySession.token });
  check(
    'GET /transactions/top for a new user -> []',
    emptyTop.status === 200 && emptyTop.body.length === 0,
    emptyTop.body,
  );

  const adminLogin = await call('POST', '/login', { body: ADMIN });
  check('POST /login as admin -> 200 with the admin role', adminLogin.status === 200 && adminLogin.body.role === 'admin', adminLogin.body);

  if (adminLogin.status === 200) {
    const asAdmin = await call('GET', `/transactions?username=${bob.username}`, {
      token: adminLogin.body.token,
    });
    check('GET /transactions?username= as admin -> 200', asAdmin.status === 200, asAdmin.body);

    const asUser = await call('GET', `/transactions?username=${bob.username}`, {
      token: aliceSession.token,
    });
    check('GET /transactions?username= as normal user -> 403', asUser.status === 403, asUser.body);
  }

  const missing = await call('GET', '/does-not-exist');
  check(
    'GET /does-not-exist -> 404 JSON error',
    missing.status === 404 && missing.body.error.code === 'NOT_FOUND',
    missing.body,
  );

  console.log(`\n${checks - failures}/${checks} checks passed.`);
  if (failures > 0) process.exitCode = 1;
}

await main().catch((error) => {
  console.error(`\nSmoke test aborted: ${error.message}`);
  process.exitCode = 1;
});

