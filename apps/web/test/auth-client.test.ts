import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWebAuth, AuthFailure } from '../src/auth/client.js';
import { resetRequestMessage } from '../src/routes/auth.js';

function harness() {
  const calls: {
    url: URL;
    init: RequestInit;
    body: Record<string, unknown>;
  }[] = [];
  let response: unknown = { status: true };
  let status = 200;
  const auth = createWebAuth(
    'https://api.example.test',
    'https://app.example.test',
    async (input, init) => {
      assert.ok(init);
      const body: unknown = init.body ? JSON.parse(String(init.body)) : {};
      assert.ok(body && typeof body === 'object' && !Array.isArray(body));
      calls.push({
        url: new URL(String(input)),
        init,
        body: Object.fromEntries(Object.entries(body)),
      });
      return Response.json(response, { status });
    },
  );
  return {
    auth,
    calls,
    reply(value: unknown, code = 200) {
      response = value;
      status = code;
    },
  };
}
test('official React client sends fixed-origin cookie requests, no v1 CSRF, custom credentials or storage', async (t) => {
  const h = harness();
  let writes = 0;
  // Even with a browser present, imperative methods with disableSignal must not mount storage broadcast.
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    'localStorage',
  );
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {},
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      setItem() {
        writes++;
      },
      getItem() {
        writes++;
      },
    },
  });
  t.after(() => {
    if (previousWindow)
      Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (previousStorage)
      Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  await h.auth.signup('Nombre', 'a@example.test', 'password-fixture');
  await h.auth.login('a@example.test', 'password-fixture');
  await h.auth.logout();
  await h.auth.resend('a@example.test');
  await h.auth.requestReset('a@example.test');
  await h.auth.reset('reset-fixture', 'new-password-fixture');
  for (const call of h.calls) {
    assert.equal(call.url.origin, 'https://api.example.test');
    assert.ok(call.url.pathname.startsWith('/api/auth/'));
    assert.equal(call.init.credentials, 'include');
    assert.equal(call.init.cache, 'no-store');
    assert.equal(call.init.redirect, 'error');
    assert.equal(new Headers(call.init.headers).get('x-csrf-token'), null);
    assert.equal(new Headers(call.init.headers).get('authorization'), null);
  }
  assert.equal(writes, 0);
  assert.deepEqual(
    h.calls.map((call) => call.url.pathname),
    [
      '/api/auth/sign-up/email',
      '/api/auth/sign-in/email',
      '/api/auth/sign-out',
      '/api/auth/send-verification-email',
      '/api/auth/request-password-reset',
      '/api/auth/reset-password',
    ],
  );
  assert.equal(
    h.calls[0]!.body.callbackURL,
    'https://app.example.test/verify-email?verified=1',
  );
  assert.equal(
    h.calls[4]!.body.redirectTo,
    'https://app.example.test/reset-password',
  );
});
test('getSession retains only identity/expiry and no session token; anonymous session stays null', async () => {
  const h = harness();
  const until = new Date(Date.now() + 60_000).toISOString();
  h.reply({
    session: { id: 's', userId: 'a', expiresAt: until, token: 'PRIVATE-TOKEN' },
    user: { id: 'a', email: 'a@example.test' },
  });
  const session = await h.auth.session();
  assert.deepEqual(session, {
    userId: 'a',
    sessionId: 's',
    expiresAt: new Date(until).getTime(),
  });
  assert.ok(!JSON.stringify(session).includes('PRIVATE-TOKEN'));
  assert.equal(h.calls[0]!.init.method, 'GET');
  h.reply(null);
  assert.equal(await h.auth.session(), null);
});
test('signup success stays verification workflow without a get-session or business call', async () => {
  const h = harness();
  h.reply({
    user: { id: 'synthetic-or-real', emailVerified: false },
    token: null,
  });
  await h.auth.signup('Nombre', 'a@example.test', 'password-fixture');
  assert.equal(h.calls.length, 1);
});
test('reset existing/missing requests produce the same public result/message', async () => {
  const h = harness();
  for (const email of ['existing@example.test', 'missing@example.test']) {
    h.reply({ status: true, message: 'If this email exists check your email' });
    assert.equal(await h.auth.requestReset(email), undefined);
  }
  assert.ok(
    resetRequestMessage.includes('Si el correo corresponde a una cuenta'),
  );
});
test('verification token is consumed by official GET with no custom redirect or crypto', async () => {
  const h = harness();
  h.reply({ status: true, user: null });
  await h.auth.verify('verify-fixture');
  const call = h.calls[0]!;
  assert.equal(call.url.pathname, '/api/auth/verify-email');
  assert.equal(call.url.searchParams.get('token'), 'verify-fixture');
  assert.equal(call.init.method, 'GET');
  assert.equal(call.url.searchParams.get('callbackURL'), null);
});
test('Better Auth errors are mapped safely, independently of ApiError envelopes; no blind retry', async () => {
  const h = harness();
  for (const [code, status, pattern] of [
    ['INVALID_EMAIL_OR_PASSWORD', 401, /Revisa el correo y la contraseña/],
    ['EMAIL_NOT_VERIFIED', 403, /Verifica tu correo/],
    ['RAW_SQL_CANARY', 500, /Vuelve a intentarlo/],
    ['RATE_LIMITED', 429, /Espera unos minutos/],
  ] as const) {
    const before = h.calls.length;
    h.reply({ code, message: 'SQL password token PRIVATE' }, status);
    await assert.rejects(
      h.auth.login('a@example.test', 'password-fixture'),
      (error: unknown) =>
        error instanceof AuthFailure &&
        pattern.test(error.message) &&
        !error.message.includes('PRIVATE'),
    );
    assert.equal(h.calls.length, before + 1);
  }
});
