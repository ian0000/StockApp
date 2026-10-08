import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localSmtp } from '../helpers/smtp.js';
import { disposableDatabase } from '../postgres/helpers.js';
import { migrateDatabase } from '../../src/infrastructure/postgres/migrate.js';

test('compiled API serves signup, verify, signin, session and logout over real HTTP and local SMTP', async (t) => {
  // Variable dynamic imports keep typecheck independent of dist, while execution requires a fresh build.
  const appModule: typeof import('../../src/app.js') = await import(
    new URL('../../dist/app.js', import.meta.url).href
  );
  const runtimeModule: typeof import('../../src/auth/runtime.js') =
    await import(new URL('../../dist/auth/runtime.js', import.meta.url).href);
  const routesModule: typeof import('../../src/auth/routes.js') = await import(
    new URL('../../dist/auth/routes.js', import.meta.url).href
  );
  const pool = await disposableDatabase(t);
  await migrateDatabase(pool);
  const smtp = await localSmtp(t);
  const app = appModule.buildApp();
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  assert.ok(address && typeof address !== 'string');
  const baseURL = `http://127.0.0.1:${address.port}`;
  await app.close();
  // Register auth before listening on the port allocated above. The probe sends no HTTP requests.
  const server = appModule.buildApp();
  const env = {
    DATABASE_URL: pool.options.connectionString,
    AUTH_BASE_URL: baseURL,
    APP_ORIGIN: 'http://localhost:5173',
    DELETION_SUPPRESSION_SECRET: 'fictional-deletion-suppression-test-secret',
    BETTER_AUTH_SECRET: 'fictional-compiled-http-test-only-secret',
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: String(smtp.port),
    SMTP_SECURITY: 'local',
    SMTP_FROM: 'auth@example.test',
  };
  const emailFailures: string[] = [];
  const runtime = runtimeModule.createAuthRuntime(env, () =>
    emailFailures.push('failed'),
  );
  routesModule.registerAuthRoutes(server, runtime.auth, runtime.config);
  try {
    await server.listen({ host: '127.0.0.1', port: address.port });
    const post = (path: string, body: unknown, cookie?: string) =>
      fetch(`${baseURL}/api/auth/${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: env.APP_ORIGIN,
          ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify(body),
        redirect: 'manual',
      });
    assert.equal((await fetch(`${baseURL}/live`)).status, 200);
    assert.equal((await fetch(`${baseURL}/health`)).status, 404);
    const signup = await post('sign-up/email', {
      name: 'Fictional',
      email: 'compiled@example.test',
      password: 'fictional-compiled-password',
    });
    assert.equal(signup.status, 200);
    assert.ok(signup.headers.get('x-request-id'));
    await runtime.drainEmails();
    assert.deepEqual(emailFailures, []);
    assert.equal(smtp.messages.length, 1);
    assert.deepEqual(smtp.recipients, ['compiled@example.test']);
    const content = smtp.messages[0]
      .replace(/=\r?\n/g, '')
      .replace(/=([0-9A-F]{2})/gi, (_match, value: string) =>
        String.fromCharCode(parseInt(value, 16)),
      );
    const link = content.match(/http:\/\/[^\s]+/);
    assert.ok(link);
    const verified = await fetch(link[0], { redirect: 'manual' });
    assert.equal(verified.status, 302);
    assert.equal(verified.headers.get('location'), '/');
    const login = await post('sign-in/email', {
      email: 'compiled@example.test',
      password: 'fictional-compiled-password',
    });
    assert.equal(login.status, 200);
    const cookies = login.headers.getSetCookie();
    assert.equal(cookies.length, 1);
    const cookie = cookies[0].split(';')[0];
    const session = await fetch(`${baseURL}/api/auth/get-session`, {
      headers: { cookie },
    });
    assert.equal(session.status, 200);
    const body: unknown = await session.json();
    assert.ok(body && typeof body === 'object' && 'user' in body);
    assert.ok(
      body.user && typeof body.user === 'object' && 'email' in body.user,
    );
    assert.equal(body.user.email, 'compiled@example.test');
    assert.equal((await post('sign-out', {}, cookie)).status, 200);
    assert.equal(
      await (
        await fetch(`${baseURL}/api/auth/get-session`, { headers: { cookie } })
      ).json(),
      null,
    );
    assert.equal((await pool.query('SELECT id FROM session')).rowCount, 0);
  } finally {
    await server.close();
    await runtime.close();
  }
  assert.equal(server.server.listening, false);
});

test('compiled foundation-only HTTP needs no DB, auth or SMTP configuration', async (t) => {
  const appModule: typeof import('../../src/app.js') = await import(
    new URL('../../dist/app.js', import.meta.url).href
  );
  const app = appModule.buildApp();
  t.after(() => app.close());
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  assert.ok(address && typeof address !== 'string');
  const baseURL = `http://127.0.0.1:${address.port}`;
  assert.equal((await fetch(`${baseURL}/live`)).status, 200);
  assert.equal((await fetch(`${baseURL}/health`)).status, 404);
  assert.equal((await fetch(`${baseURL}/api/auth/get-session`)).status, 404);
});
