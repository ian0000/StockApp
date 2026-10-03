import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../../src/app.js';
import { createAuthRuntime } from '../../src/auth/runtime.js';
import { registerOwnershipRoutes } from '../../src/ownership/routes.js';
import { registerAuthRoutes } from '../../src/auth/routes.js';

test('ownership composition with unreachable PostgreSQL/SMTP leaves /live 200 and /health 404', async (t) => {
  const runtime = createAuthRuntime(
    {
      DATABASE_URL: 'postgresql://postgres@127.0.0.1:1/stockapp_test',
      AUTH_BASE_URL: 'http://127.0.0.1:3001',
      APP_ORIGIN: 'http://localhost:5173',
      BETTER_AUTH_SECRET: 'fictional-cloud04-unreachable-test-secret',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: '1',
      SMTP_SECURITY: 'local',
      SMTP_FROM: 'auth@example.test',
    },
    () => {},
  );
  const app = buildApp();
  app.addHook('onClose', () => runtime.close());
  registerAuthRoutes(app, runtime.auth, runtime.config);
  registerOwnershipRoutes(app, runtime.auth, runtime.database);
  t.after(() => app.close());
  assert.equal((await app.inject('/live')).statusCode, 200);
  assert.equal((await app.inject('/health')).statusCode, 404);
  const preflight = await app.inject({
    method: 'OPTIONS',
    url: '/v1/business',
    headers: {
      origin: runtime.config.appOrigin,
      'access-control-request-method': 'POST',
    },
  });
  assert.equal(preflight.statusCode, 204);
  assert.equal(
    preflight.headers['access-control-allow-origin'],
    runtime.config.appOrigin,
  );
  const hostile = await app.inject({
    url: '/v1/me',
    headers: { origin: 'https://evil.example' },
  });
  assert.equal(hostile.statusCode, 403);
  assert.equal(hostile.json().error.code, 'ORIGIN_NOT_ALLOWED');
  const failure = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    payload: {
      email: 'fictional@example.test',
      password: 'fictional-password',
    },
    headers: { origin: runtime.config.appOrigin },
  });
  assert.equal(failure.statusCode, 500);
  assert.doesNotMatch(failure.body, /ECONN|postgres|SELECT|stack/);
  assert.equal((await app.inject('/v1/me')).statusCode, 401);
  assert.equal((await app.inject('/live')).statusCode, 200);
});
