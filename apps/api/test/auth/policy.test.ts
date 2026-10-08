import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authFixture, password } from './helpers.js';
import { buildApp } from '../../src/app.js';
import { createAuthRuntime } from '../../src/auth/runtime.js';
import { registerAuthRoutes } from '../../src/auth/routes.js';

test('expired verification token cannot verify email with a bounded test-only TTL', async (t) => {
  const f = await authFixture(t, { verificationExpiresIn: 1 });
  await f.signup('expired@example.test');
  await new Promise((resolve) => setTimeout(resolve, 2100));
  const link = f.emailLink('expired@example.test', 'verify');
  link.searchParams.delete('callbackURL');
  const response = await f.app.inject(link.pathname + link.search);
  assert.equal(response.statusCode, 401);
  assert.equal(
    (
      await f.pool.query<{ email_verified: boolean }>(
        'SELECT email_verified FROM "user" WHERE email=$1',
        ['expired@example.test'],
      )
    ).rows[0].email_verified,
    false,
  );
});

test('Expo development initialization cannot add implicit exp:// redirect origins', async (t) => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  try {
    const f = await authFixture(t);
    const result = await f.post('request-password-reset', {
      email: 'missing@example.test',
      redirectTo: 'exp://unconfigured.example/reset',
    });
    assert.equal(result.statusCode, 403);
    const native = await f.post('request-password-reset', {
      email: 'missing@example.test',
      redirectTo: 'inventory-app://reset',
    });
    assert.equal(native.statusCode, 200);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test('production cookie is Secure, HttpOnly, Lax, Path=/, host-only and has no session cache', async (t) => {
  const f = await authFixture(t, {
    baseURL: 'https://api.example.test',
    appOrigin: 'https://app.example.test',
    secureCookies: true,
  });
  await f.signup('cookie@example.test');
  await f.verify('cookie@example.test');
  const login = await f.signin('cookie@example.test');
  const cookies = login.result.headers['set-cookie'];
  assert.ok(cookies);
  const list = Array.isArray(cookies) ? cookies : [cookies];
  assert.equal(list.length, 1);
  assert.match(list[0], /; Secure/i);
  assert.match(list[0], /; HttpOnly/i);
  assert.match(list[0], /; SameSite=Lax/i);
  assert.match(list[0], /; Path=\//i);
  assert.doesNotMatch(list[0], /; Domain=/i);
  assert.doesNotMatch(list[0], /session_data/);
  assert.equal(
    (await f.session(login.cookie)).json().user.email,
    'cookie@example.test',
  );
});

test('raw SQL/auth failures never reach HTTP or logs and liveness stays available', async (t) => {
  const f = await authFixture(t);
  await f.pool.query('DROP TABLE account');
  const consoleError = t.mock.method(console, 'error', () => {});
  const response = await f.post('sign-up/email', {
    email: 'failure@example.test',
    password,
    name: 'Fictional',
  });
  assert.equal(response.statusCode, 500);
  assert.equal(consoleError.mock.callCount(), 0);
  assert.doesNotMatch(
    response.body + f.logs.join(''),
    /INSERT|SELECT|relation|stack|password-for-tests/,
  );
  assert.ok(response.headers['x-request-id']);
  assert.equal((await f.app.inject('/live')).statusCode, 200);
  assert.equal((await f.app.inject('/health')).statusCode, 404);
});

test('configured auth with unreachable DB/SMTP keeps liveness independent and sanitizes auth failure', async (t) => {
  const runtime = createAuthRuntime(
    {
      DATABASE_URL: 'postgresql://postgres@127.0.0.1:1/stockapp_test',
      AUTH_BASE_URL: 'http://127.0.0.1:3001',
      APP_ORIGIN: 'http://localhost:5173',
      DELETION_SUPPRESSION_SECRET: 'fictional-deletion-suppression-test-secret',
      BETTER_AUTH_SECRET: 'fictional-unreachable-dependencies-test-secret',
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
  t.after(() => app.close());
  const consoleError = t.mock.method(console, 'error', () => {});
  assert.equal((await app.inject('/live')).statusCode, 200);
  assert.equal((await app.inject('/health')).statusCode, 404);
  const signin = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    payload: { email: 'missing@example.test', password },
    headers: { origin: runtime.config.appOrigin },
  });
  assert.equal(signin.statusCode, 500);
  assert.equal(signin.json().code, 'INTERNAL_SERVER_ERROR');
  assert.doesNotMatch(signin.body, /ECONN|postgres|stack|SELECT|127\.0\.0\.1/);
  assert.equal(consoleError.mock.callCount(), 0);
  assert.equal((await app.inject('/live')).statusCode, 200);
});
