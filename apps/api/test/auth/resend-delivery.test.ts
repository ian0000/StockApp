import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../../src/app.js';
import { createAuthRuntime } from '../../src/auth/runtime.js';
import { registerAuthRoutes } from '../../src/auth/routes.js';
import { migrateDatabase } from '../../src/infrastructure/postgres/migrate.js';
import { disposableDatabase } from '../postgres/helpers.js';

test('Resend runtime preserves verified login, reset revocation and safe delivery failure with real PostgreSQL', async (t) => {
  const pool = await disposableDatabase(t);
  await migrateDatabase(pool);
  const messages: { text: string }[] = [];
  let failDelivery = false;
  t.mock.method(
    globalThis,
    'fetch',
    async (url: unknown, init: RequestInit) => {
      assert.equal(url, 'https://api.resend.com/emails');
      assert.equal(init.redirect, 'error');
      if (failDelivery)
        return Response.json(
          { error: 'fictional-private-provider-error' },
          { status: 503 },
        );
      const body: unknown = JSON.parse(String(init.body));
      assert.ok(
        body &&
          typeof body === 'object' &&
          'text' in body &&
          typeof body.text === 'string',
      );
      messages.push({ text: body.text });
      return Response.json({ id: 'fictional-delivery-id' });
    },
  );
  let failures = 0;
  const runtime = createAuthRuntime(
    {
      DATABASE_URL: pool.options.connectionString,
      AUTH_BASE_URL: 'http://127.0.0.1:3001',
      APP_ORIGIN: 'http://localhost:5173',
      BETTER_AUTH_SECRET: 'fictional-resend-auth-integration-secret',
      DELETION_SUPPRESSION_SECRET: 'fictional-resend-suppression-secret',
      AUTH_EMAIL_TRANSPORT: 'resend',
      AUTH_EMAIL_FROM: 'auth@example.test',
      RESEND_API_KEY: 'fictional-resend-integration-key',
    },
    () => {
      failures++;
    },
  );
  const app = buildApp();
  registerAuthRoutes(app, runtime.auth, runtime.config);
  const email = 'resend-tester@example.test';
  const password = 'fictional-resend-password';
  const post = (path: string, body: unknown) =>
    app.inject({
      method: 'POST',
      url: `/api/auth/${path}`,
      payload: JSON.stringify(body),
      headers: {
        origin: runtime.config.appOrigin,
        'content-type': 'application/json',
      },
    });
  const lastLink = () => {
    const match = messages.at(-1)?.text.match(/https?:\/\/[^\s]+/);
    assert.ok(match);
    return new URL(match[0]);
  };
  try {
    assert.equal(
      (
        await post('sign-up/email', {
          email,
          password,
          name: 'Synthetic tester',
        })
      ).statusCode,
      200,
    );
    await runtime.drainEmails();
    assert.equal(messages.length, 1);
    assert.equal(
      (await post('sign-in/email', { email, password })).statusCode,
      403,
    );
    const verification = lastLink();
    assert.equal(
      (await app.inject(verification.pathname + verification.search))
        .statusCode,
      302,
    );
    const login = await post('sign-in/email', { email, password });
    assert.equal(login.statusCode, 200);
    const setCookie = login.headers['set-cookie'];
    assert.ok(setCookie);
    const cookie = (Array.isArray(setCookie) ? setCookie : [setCookie])
      .map((value) => value.split(';')[0])
      .join('; ');
    const getSession = () =>
      app.inject({
        method: 'GET',
        url: '/api/auth/get-session',
        headers: { cookie },
      });
    assert.ok((await getSession()).json());
    assert.equal(
      (
        await post('request-password-reset', {
          email,
          redirectTo: runtime.config.appOrigin + '/reset-password',
        })
      ).statusCode,
      200,
    );
    await runtime.drainEmails();
    assert.equal(messages.length, 2);
    const token = lastLink().pathname.split('/').at(-1);
    assert.ok(token);
    const newPassword = 'fictional-resend-updated-password';
    assert.equal(
      (await post('reset-password', { token, newPassword })).statusCode,
      200,
    );
    assert.equal((await getSession()).json(), null);
    assert.equal(
      (await post('sign-in/email', { email, password: newPassword }))
        .statusCode,
      200,
    );
    assert.equal(
      (await post('reset-password', { token, newPassword: password }))
        .statusCode,
      400,
    );
    failDelivery = true;
    const failedEmail = 'resend-failure@example.test';
    const signup = await post('sign-up/email', {
      email: failedEmail,
      password,
      name: 'Synthetic failure',
    });
    assert.equal(signup.statusCode, 200);
    assert.equal(
      signup.body.includes('fictional-private-provider-error'),
      false,
    );
    await runtime.drainEmails();
    assert.equal(failures, 1);
    assert.equal(
      (await post('sign-in/email', { email: failedEmail, password }))
        .statusCode,
      403,
    );
  } finally {
    try {
      await runtime.close();
      await app.close();
    } finally {
      t.mock.restoreAll();
    }
  }
});
