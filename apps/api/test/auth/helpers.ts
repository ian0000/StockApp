import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import type { TestContext } from 'node:test';
import { buildApp } from '../../src/app.js';
import { createAuth } from '../../src/auth/create-auth.js';
import { readAuthConfig, type AuthConfig } from '../../src/auth/config.js';
import { registerAuthRoutes } from '../../src/auth/routes.js';
import type { AuthEmail } from '../../src/auth/email.js';
import { createDatabase } from '../../src/infrastructure/postgres/client.js';
import { migrateDatabase } from '../../src/infrastructure/postgres/migrate.js';
import { disposableDatabase } from '../postgres/helpers.js';

export const password = 'fictional-password-for-tests';
export const authConfig = readAuthConfig({
  BETTER_AUTH_SECRET: 'fictional-integration-test-only-secret',
  AUTH_BASE_URL: 'http://127.0.0.1:3001',
  APP_ORIGIN: 'http://localhost:5173',
});

export async function authFixture(
  t: TestContext,
  overrides: Partial<AuthConfig> = {},
) {
  const pool = await disposableDatabase(t);
  await migrateDatabase(pool);
  const messages: AuthEmail[] = [];
  const logs: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      logs.push(String(chunk));
      done();
    },
  });
  const config = { ...authConfig, ...overrides };
  const runtime = createAuth({
    database: createDatabase(pool),
    config,
    emailSender: {
      async send(email) {
        messages.push(email);
      },
    },
  });
  const app = buildApp({ logger: true, logStream: stream });
  registerAuthRoutes(app, runtime.auth, config);
  t.after(async () => {
    await runtime.drainEmails();
    await app.close();
  });
  async function post(
    path: string,
    body: unknown,
    cookie?: string,
    extraHeaders: Record<string, string> = {},
  ) {
    return app.inject({
      method: 'POST',
      url: `/api/auth/${path}`,
      payload: JSON.stringify(body),
      headers: {
        'content-type': 'application/json',
        origin: config.appOrigin,
        ...(cookie ? { cookie } : {}),
        ...extraHeaders,
      },
    });
  }
  async function signup(email: string) {
    const result = await post('sign-up/email', {
      email,
      password,
      name: 'Fictional User',
    });
    assert.equal(result.statusCode, 200);
    await runtime.drainEmails();
    return result;
  }
  function emailLink(email: string, kind: 'verify' | 'reset'): URL {
    const message = [...messages]
      .reverse()
      .find(
        (entry) =>
          entry.to === email &&
          entry.subject.startsWith(
            kind === 'verify' ? 'Verifica' : 'Restablece',
          ),
      );
    assert.ok(message);
    const match = message.text.match(/https?:\/\/[^\s]+/);
    assert.ok(match);
    return new URL(match[0]);
  }
  async function verify(email: string) {
    const link = emailLink(email, 'verify');
    const result = await app.inject(link.pathname + link.search);
    assert.equal(result.statusCode, 302);
    assert.equal(result.headers.location, '/');
    return result;
  }
  async function signin(email: string, nextPassword = password) {
    const result = await post('sign-in/email', {
      email,
      password: nextPassword,
    });
    assert.equal(result.statusCode, 200);
    const cookies = result.headers['set-cookie'];
    assert.ok(cookies);
    const cookie = (Array.isArray(cookies) ? cookies : [cookies])
      .map((entry) => entry.split(';')[0])
      .join('; ');
    return { result, cookie };
  }
  async function session(cookie: string) {
    return app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie },
    });
  }
  return {
    pool,
    app,
    runtime,
    config,
    messages,
    logs,
    post,
    signup,
    emailLink,
    verify,
    signin,
    session,
  };
}
