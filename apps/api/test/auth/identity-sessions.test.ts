import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authFixture, password } from './helpers.js';

test('real PostgreSQL auth identity, verification, sessions and security', async (t) => {
  const f = await authFixture(t);
  const email = 'identity@example.test';
  let cookie = '';
  let token = '';
  await t.test(
    'signup returns unverified identity, no session and no business/cloud data',
    async () => {
      const response = await f.signup(email);
      assert.equal(response.json().token, null);
      assert.equal(response.json().user.emailVerified, false);
      assert.equal(response.headers['set-cookie'], undefined);
      const user = await f.pool.query<{ email_verified: boolean }>(
        'SELECT email_verified FROM "user" WHERE email=$1',
        [email],
      );
      assert.equal(user.rows[0].email_verified, false);
      for (const table of [
        'businesses',
        'inventories',
        'products',
        'session',
      ]) {
        const result = await f.pool.query<{ count: string }>(
          `SELECT count(*) FROM ${table}`,
        );
        assert.equal(result.rows[0].count, '0');
      }
      assert.doesNotMatch(response.body, new RegExp(password));
      assert.ok(response.headers['x-request-id']);
      assert.equal(response.headers['cache-control'], 'no-store');
    },
  );
  await t.test(
    'duplicate email preserves generic signup shape and does not duplicate identity',
    async () => {
      const duplicate = await f.signup(email);
      const fresh = await f.signup('shape@example.test');
      assert.deepEqual(
        Object.keys(duplicate.json()).sort(),
        Object.keys(fresh.json()).sort(),
      );
      assert.deepEqual(
        Object.keys(duplicate.json().user).sort(),
        Object.keys(fresh.json().user).sort(),
      );
      assert.equal(duplicate.json().token, null);
      assert.equal(duplicate.json().user.emailVerified, false);
      assert.equal(
        (
          await f.pool.query<{ count: string }>(
            'SELECT count(*) FROM "user" WHERE email=$1',
            [email],
          )
        ).rows[0].count,
        '1',
      );
    },
  );
  await t.test('invalid email and password bounds are rejected', async () => {
    for (const body of [
      { email: 'invalid', password },
      { email: 'short@example.test', password: 'short' },
      { email: 'long@example.test', password: 'x'.repeat(129) },
    ]) {
      const result = await f.post('sign-up/email', {
        name: 'Fictional',
        ...body,
      });
      assert.equal(result.statusCode, 400);
    }
  });
  await t.test(
    'verification resend uses the official endpoint and sends only for an existing unverified user',
    async () => {
      const before = f.messages.length;
      const existing = await f.post('send-verification-email', {
        email: 'shape@example.test',
        callbackURL: f.config.appOrigin + '/verified',
      });
      const missing = await f.post('send-verification-email', {
        email: 'missing@example.test',
        callbackURL: f.config.appOrigin + '/verified',
      });
      assert.equal(existing.statusCode, 200);
      assert.equal(missing.statusCode, existing.statusCode);
      assert.deepEqual(missing.json(), existing.json());
      await f.runtime.drainEmails();
      assert.equal(f.messages.length, before + 1);
      assert.equal(
        f
          .emailLink('shape@example.test', 'verify')
          .searchParams.get('callbackURL'),
        f.config.appOrigin + '/verified',
      );
    },
  );
  await t.test(
    'verification without callback returns the official success JSON',
    async () => {
      const link = f.emailLink('shape@example.test', 'verify');
      link.searchParams.delete('callbackURL');
      const result = await f.app.inject(link.pathname + link.search);
      assert.equal(result.statusCode, 200);
      assert.equal(result.json().status, true);
      assert.equal(result.json().user, null);
      assert.equal(
        (
          await f.pool.query<{ email_verified: boolean }>(
            'SELECT email_verified FROM "user" WHERE email=$1',
            ['shape@example.test'],
          )
        ).rows[0].email_verified,
        true,
      );
      assert.equal(result.headers['set-cookie'], undefined);
    },
  );
  await t.test(
    'unverified signin cannot create a usable DB session',
    async () => {
      const result = await f.post('sign-in/email', { email, password });
      assert.equal(result.statusCode, 403);
      assert.equal(result.json().code, 'EMAIL_NOT_VERIFIED');
      assert.equal(
        (await f.pool.query<{ count: string }>('SELECT count(*) FROM session'))
          .rows[0].count,
        '0',
      );
      assert.equal(result.headers['set-cookie'], undefined);
    },
  );
  await t.test(
    'verification email has explicit API URL and a 24 hour library token',
    async () => {
      const link = f.emailLink(email, 'verify');
      assert.equal(link.origin, f.config.baseURL);
      assert.equal(link.pathname, '/api/auth/verify-email');
      const verificationToken = link.searchParams.get('token');
      assert.ok(verificationToken);
      // Inspect TTL without using this payload as an authority or minting our own token.
      const claims: { exp: number; iat: number } = JSON.parse(
        Buffer.from(verificationToken.split('.')[1], 'base64url').toString(),
      );
      assert.equal(claims.exp - claims.iat, 86400);
      assert.ok(
        f.messages.some(
          (message) =>
            message.to === email && message.text.includes('24 horas'),
        ),
      );
    },
  );
  await t.test(
    'valid verification marks email verified without signing in',
    async () => {
      const result = await f.verify(email);
      assert.equal(
        (
          await f.pool.query<{ email_verified: boolean }>(
            'SELECT email_verified FROM "user" WHERE email=$1',
            [email],
          )
        ).rows[0].email_verified,
        true,
      );
      assert.equal(result.headers['set-cookie'], undefined);
      assert.equal(
        (await f.pool.query<{ count: string }>('SELECT count(*) FROM session'))
          .rows[0].count,
        '0',
      );
    },
  );
  await t.test(
    'verification reuse is idempotent in 1.7.7 and cannot create sessions',
    async () => {
      const before = (
        await f.pool.query('SELECT * FROM "user" WHERE email=$1', [email])
      ).rows;
      await f.verify(email);
      assert.deepEqual(
        (await f.pool.query('SELECT * FROM "user" WHERE email=$1', [email]))
          .rows,
        before,
      );
      assert.equal(
        (await f.pool.query<{ count: string }>('SELECT count(*) FROM session'))
          .rows[0].count,
        '0',
      );
    },
  );
  await t.test(
    'valid signin creates an opaque DB session and library password hash',
    async () => {
      const signin = await f.signin(email);
      cookie = signin.cookie;
      token = signin.result.json().token;
      assert.equal(typeof token, 'string');
      assert.ok(token.length > 16);
      assert.equal(token.split('.').length, 1);
      const session = await f.pool.query<{
        token: string;
        created_at: Date;
        expires_at: Date;
      }>('SELECT token,created_at,expires_at FROM session WHERE token=$1', [
        token,
      ]);
      assert.equal(session.rowCount, 1);
      assert.ok(
        Math.abs(
          session.rows[0].expires_at.getTime() -
            session.rows[0].created_at.getTime() -
            604800000,
        ) < 1000,
      );
      const account = await f.pool.query<{ password: string }>(
        'SELECT password FROM account a JOIN "user" u ON u.id=a.user_id WHERE u.email=$1',
        [email],
      );
      assert.ok(account.rows[0].password);
      assert.notEqual(account.rows[0].password, password);
      assert.doesNotMatch(signin.result.body, new RegExp(password));
      assert.doesNotMatch(cookie, /session_data|Fictional|identity@example/);
    },
  );
  await t.test(
    'incorrect and unknown credentials share generic public response',
    async () => {
      const wrong = await f.post('sign-in/email', {
        email,
        password: 'fictional-wrong-password',
      });
      const missing = await f.post('sign-in/email', {
        email: 'missing@example.test',
        password: 'fictional-wrong-password',
      });
      assert.equal(wrong.statusCode, 401);
      assert.equal(missing.statusCode, wrong.statusCode);
      assert.deepEqual(missing.json(), wrong.json());
    },
  );
  await t.test(
    'session lookup consults DB and never refreshes the absolute expiry',
    async () => {
      await f.pool.query(
        "UPDATE session SET created_at=now()-interval '3 days',updated_at=now()-interval '3 days',expires_at=now()+interval '4 days' WHERE token=$1",
        [token],
      );
      const before = (
        await f.pool.query(
          'SELECT expires_at,updated_at FROM session WHERE token=$1',
          [token],
        )
      ).rows;
      const response = await f.session(cookie);
      assert.equal(response.statusCode, 200);
      assert.equal(response.json().user.email, email);
      assert.equal(response.headers['set-cookie'], undefined);
      await f.session(cookie);
      assert.deepEqual(
        (
          await f.pool.query(
            'SELECT expires_at,updated_at FROM session WHERE token=$1',
            [token],
          )
        ).rows,
        before,
      );
    },
  );
  await t.test(
    'native cookie transport works with exact expo-origin and rejects hostile origin',
    async () => {
      const native = await f.app.inject({
        method: 'GET',
        url: '/api/auth/get-session',
        headers: { cookie, 'expo-origin': 'inventory-app://' },
      });
      assert.equal(native.json().user.email, email);
      const anonymous = await f.app.inject({
        method: 'GET',
        url: '/api/auth/get-session',
        headers: { 'expo-origin': 'inventory-app://' },
      });
      assert.equal(anonymous.json(), null);
      const hostileHeaders: Record<string, string>[] = [
        { origin: 'https://evil.example.test' },
        { 'expo-origin': 'other-app://' },
        { origin: 'exp://' },
        {
          origin: f.config.appOrigin,
          'expo-origin': 'https://evil.example.test',
        },
      ];
      for (const headers of hostileHeaders) {
        const result = await f.post('sign-out', {}, cookie, headers);
        assert.equal(result.statusCode, 403);
      }
      assert.equal((await f.session(cookie)).json().user.email, email);
    },
  );
  await t.test(
    'library Origin, Referer, CSRF and redirect checks remain enabled',
    async () => {
      const referer = await f.app.inject({
        method: 'POST',
        url: '/api/auth/sign-out',
        payload: '{}',
        headers: {
          cookie,
          'content-type': 'application/json',
          referer: 'https://evil.example.test/path',
        },
      });
      assert.equal(referer.statusCode, 403);
      const crossSite = await f.app.inject({
        method: 'POST',
        url: '/api/auth/sign-in/email',
        payload: JSON.stringify({ email, password }),
        headers: {
          'content-type': 'application/json',
          'sec-fetch-site': 'cross-site',
          'sec-fetch-mode': 'navigate',
        },
      });
      assert.equal(crossSite.statusCode, 403);
      for (const path of [
        'request-password-reset',
        'send-verification-email',
      ]) {
        const result = await f.post(path, {
          email,
          redirectTo: 'https://evil.example.test/reset',
          callbackURL: 'https://evil.example.test/verify',
        });
        assert.equal(result.statusCode, 403);
      }
      const link = f.emailLink(email, 'verify');
      link.searchParams.set('callbackURL', 'https://evil.example.test/verify');
      assert.equal(
        (await f.app.inject(link.pathname + link.search)).statusCode,
        403,
      );
    },
  );
  await t.test(
    'malformed auth JSON is sanitized by the HTTP foundation',
    async () => {
      const result = await f.app.inject({
        method: 'POST',
        url: '/api/auth/sign-in/email',
        payload: '{',
        headers: { 'content-type': 'application/json' },
      });
      assert.equal(result.statusCode, 400);
      assert.ok(result.headers['x-request-id']);
      assert.doesNotMatch(result.body, /SyntaxError|stack|SQL/);
    },
  );
  await t.test(
    'direct deletion, profile editing, OAuth and business routes stay absent',
    async () => {
      for (const path of [
        'delete-user',
        'change-email',
        'update-user',
        'update-session',
        'change-password',
        'sign-in/social',
      ]) {
        assert.equal((await f.post(path, {}, cookie)).statusCode, 404);
      }
      assert.equal(
        (await f.app.inject('/api/auth/delete-user/callback?token=fictional'))
          .statusCode,
        404,
      );
      assert.equal(
        (await f.app.inject('/api/auth/expo-authorization-proxy')).statusCode,
        404,
      );
      for (const path of [
        '/health',
        '/v1/me',
        '/v1/business',
        '/v1/products',
        '/v1/sales',
        '/v1/purchases',
        '/v1/history',
        '/v1/sync',
        '/v1/session/csrf',
      ]) {
        assert.equal((await f.app.inject(path)).statusCode, 404);
      }
      assert.equal((await f.app.inject('/live')).statusCode, 200);
      assert.equal(
        (
          await f.pool.query<{ count: string }>(
            'SELECT count(*) FROM "user" WHERE email=$1',
            [email],
          )
        ).rows[0].count,
        '1',
      );
    },
  );
  await t.test(
    'signout deletes current DB session and clears cookie without affecting another',
    async () => {
      const other = await f.signin(email);
      const result = await f.post('sign-out', {}, cookie);
      assert.equal(result.statusCode, 200);
      assert.equal((await f.session(cookie)).json(), null);
      assert.equal(
        (await f.pool.query('SELECT id FROM session WHERE token=$1', [token]))
          .rowCount,
        0,
      );
      assert.ok(result.headers['set-cookie']);
      assert.equal((await f.session(other.cookie)).json().user.email, email);
      cookie = other.cookie;
    },
  );
  await t.test(
    'list and revoke-other-sessions preserve only current session',
    async () => {
      const other = await f.signin(email);
      const list = await f.app.inject({
        method: 'GET',
        url: '/api/auth/list-sessions',
        headers: { cookie },
      });
      assert.equal(list.statusCode, 200);
      assert.equal(list.json().length, 2);
      assert.equal(
        (await f.post('revoke-other-sessions', {}, cookie)).statusCode,
        200,
      );
      assert.equal((await f.session(other.cookie)).json(), null);
      assert.equal((await f.session(cookie)).json().user.email, email);
    },
  );
  await t.test(
    'revoke-session removes the selected session immediately',
    async () => {
      const other = await f.signin(email);
      assert.equal(
        (
          await f.post(
            'revoke-session',
            { token: other.result.json().token },
            cookie,
          )
        ).statusCode,
        200,
      );
      assert.equal((await f.session(other.cookie)).json(), null);
      assert.equal((await f.session(cookie)).json().user.email, email);
    },
  );
  await t.test(
    'revoke-all invalidates all cookies immediately without cookie cache',
    async () => {
      const other = await f.signin(email);
      assert.equal(
        (await f.post('revoke-sessions', {}, cookie)).statusCode,
        200,
      );
      assert.equal((await f.session(cookie)).json(), null);
      assert.equal((await f.session(other.cookie)).json(), null);
      assert.equal((await f.pool.query('SELECT id FROM session')).rowCount, 0);
    },
  );
  await t.test(
    'expired DB session is rejected even when its signed cookie remains valid',
    async () => {
      const expired = await f.signin(email);
      await f.pool.query(
        "UPDATE session SET expires_at=now()-interval '1 second' WHERE token=$1",
        [expired.result.json().token],
      );
      assert.equal((await f.session(expired.cookie)).json(), null);
    },
  );
  await t.test(
    'logs contain no passwords, cookies, session/verification tokens or auth secret',
    async () => {
      await f.app.inject({
        method: 'GET',
        url: '/api/auth/get-session?token=fictional-query-secret',
        headers: {
          authorization: 'Bearer fictional-authorization',
          cookie: 'fictional-cookie-secret',
        },
      });
      const log = f.logs.join('');
      for (const secret of [
        password,
        token,
        cookie,
        f.config.secret,
        'fictional-query-secret',
        'fictional-authorization',
        'fictional-cookie-secret',
        ...f.messages.map((message) => message.text),
      ]) {
        assert.equal(log.includes(secret), false);
      }
      for (const message of f.messages) {
        const link = message.text.match(/https?:\/\/[^\s]+/)?.[0];
        assert.ok(link);
        assert.equal(
          log.includes(new URL(link).searchParams.get('token') ?? 'no-token'),
          false,
        );
      }
      assert.match(log, /reqId/);
    },
  );
});
