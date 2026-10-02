import supertest from 'supertest';
import { APP_CONFIG } from '../src/config/config.module';
import type { AppConfig } from '../src/config/configuration';
import { adminCredentials, agentFor, createTestContext, TestContext } from './helpers/test-app';

/**
 * Integration tests of the browser contract, which the other suites cannot see: they call the API
 * directly, and a direct call sends neither an `Origin` header nor a preflight. A browser sends both
 * before `POST /login` (a JSON body makes the request non-simple) and then rejects the response
 * unless `Access-Control-Allow-Origin` names the *requesting* origin.
 *
 * That is how a dashboard served from `http://127.0.0.1:5173` ends up unable to reach an API
 * configured only for `http://localhost:5173` — same machine, same port, different origin.
 */
describe('integration: CORS', () => {
  let context: TestContext;
  let api: supertest.Agent;
  /** The configured allow-list, read from the application so the test cannot drift from the config. */
  let allowed: string[];

  beforeAll(async () => {
    context = await createTestContext();
    api = agentFor(context.app);

    const { corsOrigin } = context.app.get<AppConfig>(APP_CONFIG);
    allowed = corsOrigin
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin !== '');
    // A per-origin policy only exists for a concrete list; `*` allows everyone and is not a value this
    // API ships, so a suite running against it would be asserting nothing.
    expect(corsOrigin).not.toBe('*');
  });

  afterAll(async () => {
    await context.close();
  });

  /** What a browser sends before a JSON `POST /login`. */
  function preflight(origin: string) {
    return api
      .options('/api/v1/login')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');
  }

  it('permits the preflight of a configured origin', async () => {
    const response = await preflight(allowed[0]).expect(204);

    expect(response.headers['access-control-allow-origin']).toBe(allowed[0]);
    expect(response.headers['access-control-allow-methods']).toContain('POST');
    expect(response.headers['access-control-allow-headers']).toContain('content-type');
  });

  it('names each configured origin to itself, so every spelling of the dashboard works', async () => {
    for (const origin of allowed) {
      const response = await preflight(origin).expect(204);
      expect(response.headers['access-control-allow-origin']).toBe(origin);
    }
  });

  it('sends no CORS header to an origin that is not configured', async () => {
    const response = await preflight('http://not-the-dashboard.example').expect(204);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('carries the header on the real request, not only on the preflight', async () => {
    await context.seedAdmin();

    const response = await api
      .post('/api/v1/login')
      .set('Origin', allowed[0])
      .send(adminCredentials(context.app))
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe(allowed[0]);
  });
});
