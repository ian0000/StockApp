import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authFixture } from '../auth/helpers.js';
import { createDatabase } from '../../src/infrastructure/postgres/client.js';
import { registerOwnershipRoutes } from '../../src/ownership/routes.js';
import { setPilotAccess } from '../../src/ownership/pilot.js';
import { authorizeBusinessRequest } from '../../src/security/business.js';
import { resolveCloudInventory } from '../../src/ownership/context.js';
import { OwnershipError } from '../../src/ownership/errors.js';
import { createApiError } from '@stock-app/contracts';

const input = {
  inventoryName: 'Fictional',
  currency: 'USD',
  reportingTimeZone: 'UTC',
};

test('CORS, Origin, CSRF, transport and ownership with real sessions and PostgreSQL', async (t) => {
  let now = Date.now();
  const f = await authFixture(t, {}, () => now);
  const db = createDatabase(f.pool);
  registerOwnershipRoutes(f.app, f.runtime.auth, db);
  // This mutation exists only in the isolated test app to prove CSRF/IDOR order.
  f.app.post<{ Params: { inventoryId: string } }>(
    '/v1/test-mutation/:inventoryId',
    async (request, reply) => {
      try {
        const session = await authorizeBusinessRequest(f.runtime.auth, request);
        await resolveCloudInventory(db, session, request.params.inventoryId);
        return { accepted: true };
      } catch (error) {
        if (error instanceof OwnershipError)
          return reply
            .code(error.statusCode)
            .send(createApiError(error.code, error.message, request.id));
        throw error;
      }
    },
  );
  const get = (url: string, cookie?: string, origin?: string) =>
    f.app.inject({
      url,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(origin !== undefined ? { origin } : {}),
      },
    });
  const post = (
    cookie?: string,
    token?: string,
    origin?: string,
    payload: unknown = input,
  ) =>
    f.app.inject({
      method: 'POST',
      url: '/v1/business',
      payload: JSON.stringify(payload),
      headers: {
        'content-type': 'application/json; charset=utf-8',
        ...(cookie ? { cookie } : {}),
        ...(token ? { 'x-csrf-token': token } : {}),
        ...(origin !== undefined ? { origin } : {}),
      },
    });
  function error(
    response: Awaited<ReturnType<typeof get>>,
    status: number,
    code: string,
  ) {
    assert.equal(response.statusCode, status, response.body);
    assert.equal(response.json().error.code, code);
    assert.equal(
      response.json().error.requestId,
      response.headers['x-request-id'],
    );
    assert.equal(response.headers['cache-control'], 'no-store');
  }
  await t.test(
    'anonymous CSRF and opaque token alone cannot authenticate',
    async () => {
      error(await get('/v1/session/csrf'), 401, 'UNAUTHENTICATED');
      error(await post(undefined, 'x'.repeat(43)), 401, 'UNAUTHENTICATED');
    },
  );
  await f.signup('security-a@example.test');
  await f.verify('security-a@example.test');
  const a = await f.signin('security-a@example.test');
  const a2 = await f.signin('security-a@example.test');
  await f.signup('security-b@example.test');
  await f.verify('security-b@example.test');
  const b = await f.signin('security-b@example.test');
  const token = (
    await get('/v1/session/csrf', a.cookie, f.config.appOrigin)
  ).json().token;
  const token2 = (await get('/v1/session/csrf', a2.cookie)).json().token;
  const tokenB = (await get('/v1/session/csrf', b.cookie)).json().token;
  await t.test(
    'CSRF is opaque, stable in one session, different across same-user sessions and users',
    async () => {
      assert.match(token, /^[A-Za-z0-9_-]{43}$/);
      assert.equal(
        (await get('/v1/session/csrf', a.cookie)).json().token,
        token,
      );
      assert.notEqual(token, token2);
      assert.notEqual(token, tokenB);
      assert.notEqual(token, a.result.json().token);
      assert.ok(!token.includes(a.result.json().user.id));
    },
  );
  await t.test(
    'allowed CORS has exact origin, credentials, Vary and limited exposed headers',
    async () => {
      const r = await get('/v1/me', a.cookie, f.config.appOrigin);
      assert.equal(r.statusCode, 200);
      assert.equal(
        r.headers['access-control-allow-origin'],
        f.config.appOrigin,
      );
      assert.equal(r.headers['access-control-allow-credentials'], 'true');
      assert.match(String(r.headers.vary), /Origin/i);
      assert.deepEqual(
        String(r.headers['access-control-expose-headers'])
          .toLowerCase()
          .split(',')
          .map((part) => part.trim()),
        ['x-request-id', 'retry-after', 'x-retry-after'],
      );
      assert.equal(r.headers['x-content-type-options'], 'nosniff');
      assert.equal(r.headers['referrer-policy'], 'no-referrer');
    },
  );
  await t.test(
    'valid preflight needs no identity, performs no counters or business writes',
    async () => {
      const before = (
        await f.pool.query(
          'SELECT * FROM security_rate_limits ORDER BY scope,key_hash',
        )
      ).rows;
      for (const url of ['/v1/business', '/api/auth/sign-in/email']) {
        const r = await f.app.inject({
          method: 'OPTIONS',
          url,
          headers: {
            origin: f.config.appOrigin,
            'access-control-request-method': 'POST',
            'access-control-request-headers':
              'Content-Type,X-CSRF-Token,Idempotency-Key',
          },
        });
        assert.equal(r.statusCode, 204);
        assert.equal(
          r.headers['access-control-allow-origin'],
          f.config.appOrigin,
        );
        assert.equal(r.headers['access-control-allow-credentials'], 'true');
        assert.deepEqual(
          String(r.headers['access-control-allow-methods'])
            .split(',')
            .map((part) => part.trim()),
          ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
        );
        assert.deepEqual(
          String(r.headers['access-control-allow-headers'])
            .toLowerCase()
            .split(',')
            .map((part) => part.trim()),
          ['content-type', 'x-csrf-token', 'idempotency-key'],
        );
        assert.equal(r.headers['set-cookie'], undefined);
      }
      assert.deepEqual(
        (
          await f.pool.query(
            'SELECT * FROM security_rate_limits ORDER BY scope,key_hash',
          )
        ).rows,
        before,
      );
      assert.equal(
        (await f.pool.query('SELECT * FROM businesses')).rowCount,
        0,
      );
      error(
        await f.app.inject({
          method: 'OPTIONS',
          url: '/v1/business',
          headers: { origin: f.config.appOrigin },
        }),
        400,
        'VALIDATION_ERROR',
      );
    },
  );
  for (const origin of [
    'null',
    'https://evil.example',
    'https://ian-k.dev',
    'https://unapproved.pages.dev',
    f.config.appOrigin + '.evil.example',
    f.config.appOrigin + '/',
    'http://localhost:5174',
  ]) {
    await t.test(
      `hostile Origin ${origin} blocks GET, POST and preflight before any database work`,
      async () => {
        const before = (
          await f.pool.query(
            'SELECT * FROM security_rate_limits ORDER BY scope,key_hash',
          )
        ).rows;
        for (const r of [
          await get('/v1/me', a.cookie, origin),
          await post(a.cookie, token, origin),
          await f.app.inject({
            method: 'OPTIONS',
            url: '/v1/business',
            headers: { origin, 'access-control-request-method': 'POST' },
          }),
        ]) {
          error(r, 403, 'ORIGIN_NOT_ALLOWED');
          assert.equal(r.headers['access-control-allow-origin'], undefined);
          assert.ok(!r.body.includes(origin));
        }
        assert.deepEqual(
          (
            await f.pool.query(
              'SELECT * FROM security_rate_limits ORDER BY scope,key_hash',
            )
          ).rows,
          before,
        );
      },
    );
  }
  await t.test(
    'missing, malformed, cross-session and cross-user CSRF reject without business writes',
    async () => {
      for (const invalid of [undefined, 'bad', 'x'.repeat(43), token2, tokenB])
        error(await post(a.cookie, invalid), 403, 'CSRF_TOKEN_INVALID');
      assert.equal(
        (await f.pool.query('SELECT * FROM businesses')).rowCount,
        0,
      );
    },
  );
  let datasetA: { business: { id: string }; inventory: { id: string } };
  let datasetB: { business: { id: string }; inventory: { id: string } };
  await t.test(
    'allowed and absent Origin with valid session/CSRF permit only an empty bootstrap',
    async () => {
      const r = await post(a.cookie, token, f.config.appOrigin);
      assert.equal(r.statusCode, 201);
      datasetA = r.json();
      const repeated = await post(a.cookie, token);
      assert.equal(repeated.statusCode, 200);
      assert.deepEqual(repeated.json(), datasetA);
      const rb = await post(b.cookie, tokenB);
      assert.equal(rb.statusCode, 201);
      datasetB = rb.json();
      for (const table of ['products', 'sales', 'purchases'])
        assert.equal(
          (await f.pool.query(`SELECT * FROM ${table}`)).rowCount,
          0,
        );
      await setPilotAccess(db, a.result.json().user.id, true);
      await setPilotAccess(db, b.result.json().user.id, true);
    },
  );
  await t.test(
    'GET uses ownership without CSRF; isolated mutation validates CSRF before foreign lookup',
    async () => {
      assert.equal(
        (await get(`/v1/inventories/${datasetA.inventory.id}`, a.cookie))
          .statusCode,
        200,
      );
      error(
        await get(`/v1/inventories/${datasetB.inventory.id}`, a.cookie),
        404,
        'NOT_FOUND',
      );
      for (const [csrf, status, code] of [
        [token, 404, 'NOT_FOUND'],
        ['bad', 403, 'CSRF_TOKEN_INVALID'],
      ] as const) {
        error(
          await f.app.inject({
            method: 'POST',
            url: `/v1/test-mutation/${datasetB.inventory.id}`,
            payload: {},
            headers: { cookie: a.cookie, 'x-csrf-token': csrf },
          }),
          status,
          code,
        );
      }
    },
  );
  await t.test(
    'client identity/role/mobile headers grant no privilege',
    async () => {
      error(
        await f.app.inject({
          url: '/v1/me',
          headers: {
            'x-user-id': a.result.json().user.id,
            'x-business-id': datasetA.business.id,
            'x-inventory-id': datasetA.inventory.id,
            'x-role': 'admin',
            'x-admin': 'true',
            'x-mobile': 'true',
          },
        }),
        401,
        'UNAUTHENTICATED',
      );
    },
  );
  await t.test(
    'JSON-only mutation and both body limits reject before counters and writes',
    async () => {
      const before = (
        await f.pool.query(
          'SELECT * FROM security_rate_limits ORDER BY scope,key_hash',
        )
      ).rows;
      for (const media of [
        'text/plain',
        'application/x-www-form-urlencoded',
        'multipart/form-data',
      ])
        error(
          await f.app.inject({
            method: 'POST',
            url: '/v1/business',
            headers: { 'content-type': media, cookie: a.cookie },
            payload: JSON.stringify(input),
          }),
          415,
          'UNSUPPORTED_MEDIA_TYPE',
        );
      error(
        await post(a.cookie, token, undefined, {
          ...input,
          inventoryName: 'x'.repeat(33000),
        }),
        413,
        'PAYLOAD_TOO_LARGE',
      );
      const large = await f.app.inject({
        method: 'POST',
        url: '/api/auth/sign-in/email',
        payload: {
          email: 'large@example.test',
          password: 'x'.repeat(1024 * 1024),
        },
      });
      error(large, 413, 'PAYLOAD_TOO_LARGE');
      assert.deepEqual(
        (
          await f.pool.query(
            'SELECT * FROM security_rate_limits ORDER BY scope,key_hash',
          )
        ).rows,
        before,
      );
      assert.equal(
        (await f.pool.query('SELECT * FROM businesses')).rowCount,
        2,
      );
    },
  );
  await t.test(
    '120 reads per user shared across read routes; other user remains allowed; window expiry',
    async () => {
      now += 60001;
      for (let i = 0; i < 120; i++)
        assert.equal(
          (await get(i % 2 ? '/v1/me' : '/v1/session/csrf', a.cookie))
            .statusCode,
          200,
        );
      const r = await get('/v1/me', a.cookie);
      error(r, 429, 'RATE_LIMITED');
      assert.equal(r.headers['retry-after'], '60');
      assert.equal((await get('/v1/me', b.cookie)).statusCode, 200);
      now += 60000;
      assert.equal((await get('/v1/me', a.cookie)).statusCode, 200);
    },
  );
  await t.test(
    '60 commands per user, 61st fails, no duplicate bootstrap, preflight still free',
    async () => {
      now += 60001;
      for (let i = 0; i < 60; i++)
        assert.equal((await post(a.cookie, token)).statusCode, 200);
      error(await post(a.cookie, token), 429, 'RATE_LIMITED');
      assert.equal(
        (await f.pool.query('SELECT * FROM businesses')).rowCount,
        2,
      );
      assert.equal(
        (
          await f.app.inject({
            method: 'OPTIONS',
            url: '/v1/business',
            headers: {
              origin: f.config.appOrigin,
              'access-control-request-method': 'POST',
            },
          })
        ).statusCode,
        204,
      );
    },
  );
  await t.test(
    'expiry, logout and password reset invalidate old session-bound CSRF',
    async () => {
      now += 60001;
      await f.pool.query(
        "UPDATE session SET expires_at=now()-interval '1 second' WHERE token=$1",
        [a2.result.json().token],
      );
      error(await post(a2.cookie, token2), 401, 'UNAUTHENTICATED');
      assert.equal((await f.post('sign-out', {}, a.cookie)).statusCode, 200);
      error(await post(a.cookie, token), 401, 'UNAUTHENTICATED');
      assert.equal(
        (
          await f.post('request-password-reset', {
            email: 'security-b@example.test',
          })
        ).statusCode,
        200,
      );
      await f.runtime.drainEmails();
      const link = f.emailLink('security-b@example.test', 'reset');
      assert.equal(
        (
          await f.post('reset-password', {
            token: link.pathname.split('/').at(-1),
            newPassword: 'fictional-new-password',
          })
        ).statusCode,
        200,
      );
      error(await post(b.cookie, tokenB), 401, 'UNAUTHENTICATED');
    },
  );
  await t.test(
    'canaries in logs and public errors never leak passwords, cookies or tokens',
    async () => {
      const r = await f.app.inject({
        method: 'POST',
        url: '/v1/business?token=verification-reset-canary',
        headers: {
          cookie: 'cookie-canary',
          'x-csrf-token': 'csrf-canary',
          authorization: 'secret-canary',
        },
        payload: {
          ...input,
          password: 'password-canary',
          newPassword: 'newPassword-canary',
          DATABASE_URL: 'database-url-canary',
          SMTP_PASSWORD: 'smtp-canary',
        },
      });
      assert.equal(r.statusCode, 400);
      assert.doesNotMatch(
        r.body + f.logs.join(''),
        /verification-reset-canary|cookie-canary|csrf-canary|secret-canary|password-canary|newPassword-canary|database-url-canary|smtp-canary/,
      );
    },
  );
});
