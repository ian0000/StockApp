import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authFixture, password, authConfig } from '../auth/helpers.js';
import { createDatabase } from '../../src/infrastructure/postgres/client.js';
import { createAuth } from '../../src/auth/create-auth.js';
import { registerAuthRoutes } from '../../src/auth/routes.js';
import { registerOwnershipRoutes } from '../../src/ownership/routes.js';
import { buildApp } from '../../src/app.js';
import pg from 'pg';

test('atomic counters persist through actual runtime restart and two independent PostgreSQL pools', async (t) => {
  let now = Date.now();
  const f = await authFixture(t, {}, () => now);
  registerOwnershipRoutes(f.app, f.runtime.auth, createDatabase(f.pool));
  await f.signup('durable@example.test');
  await f.verify('durable@example.test');
  const { cookie } = await f.signin('durable@example.test');
  now += 60001;
  for (let i = 0; i < 80; i++)
    assert.equal(
      (await f.app.inject({ url: '/v1/me', headers: { cookie } })).statusCode,
      200,
    );
  for (let i = 0; i < 4; i++)
    assert.equal(
      (
        await f.post('sign-in/email', {
          email: 'restart-missing@example.test',
          password,
        })
      ).statusCode,
      401,
    );
  await f.app.close();
  async function instance() {
    // Give the stress harness a bounded acquisition wait, separate from the production 2s policy.
    const pool = new pg.Pool({
      connectionString: f.pool.options.connectionString,
      max: 10,
      connectionTimeoutMillis: 10000,
      options: '-c timezone=UTC',
    });
    const database = createDatabase(pool);
    const runtime = createAuth({
      database,
      config: authConfig,
      securityClock: () => now,
      emailSender: { async send() {} },
    });
    const app = buildApp();
    registerAuthRoutes(app, runtime.auth, authConfig);
    registerOwnershipRoutes(app, runtime.auth, database);
    let closed = false;
    async function close() {
      if (closed) return;
      closed = true;
      await app.close();
      await runtime.drainEmails();
      await pool.end();
    }
    t.after(close);
    await pool.query('SELECT 1');
    await app.ready();
    return { app, runtime, close };
  }
  const x = await instance(),
    y = await instance();
  await t.test(
    'restart preserves remaining allowance and concurrent instances permit exactly 40 remaining reads',
    async () => {
      const responses = await Promise.all(
        Array.from({ length: 80 }, (_, i) =>
          (i % 2 ? x : y).app.inject({ url: '/v1/me', headers: { cookie } }),
        ),
      );
      assert.equal(responses.filter((r) => r.statusCode === 200).length, 40);
      assert.equal(responses.filter((r) => r.statusCode === 429).length, 40);
    },
  );
  const authPost = (target: typeof x, path: string, email: string) =>
    target.app.inject({
      method: 'POST',
      url: `/api/auth/${path}`,
      headers: { origin: authConfig.appOrigin },
      payload: { email, password },
    });
  await t.test(
    'login allowance survives runtime restart with only the fifth attempt remaining',
    async () => {
      assert.equal(
        (await authPost(x, 'sign-in/email', 'restart-missing@example.test'))
          .statusCode,
        401,
      );
      const r = await authPost(
        y,
        'sign-in/email/',
        'restart-missing@example.test',
      );
      assert.equal(r.statusCode, 429);
      assert.equal(r.headers['x-retry-after'], '60');
    },
  );
  await t.test(
    'parallel login and reset HTTP calls on two instances allow exactly five and three',
    async () => {
      for (const [path, email, max, acceptedStatus] of [
        ['sign-in/email', 'parallel-login@example.test', 5, 401],
        ['request-password-reset', 'parallel-reset@example.test', 3, 200],
      ] as const) {
        now += 60001;
        const responses = await Promise.all(
          Array.from({ length: 20 }, (_, i) =>
            authPost(i % 2 ? x : y, path, email),
          ),
        );
        assert.equal(
          responses.filter((r) => r.statusCode === acceptedStatus).length,
          max,
        );
        assert.equal(
          responses.filter((r) => r.statusCode === 429).length,
          20 - max,
        );
      }
    },
  );
  await t.test(
    'parallel sensitive auth HTTP calls share exactly thirty attempts across instances',
    async () => {
      now += 60001;
      const responses = await Promise.all(
        Array.from({ length: 60 }, (_, i) =>
          authPost(
            i % 2 ? x : y,
            'send-verification-email',
            `parallel-ip-${i}@example.test`,
          ),
        ),
      );
      assert.equal(responses.filter((r) => r.statusCode === 200).length, 30);
      assert.equal(responses.filter((r) => r.statusCode === 429).length, 30);
    },
  );
  await t.test(
    '100 simultaneous consumers on two pools allow exactly five; expiry works without sleep',
    async () => {
      const results = await Promise.all(
        Array.from({ length: 100 }, (_, i) =>
          (i % 2 ? x : y).runtime.auth.security.consume(
            'concurrency-fixture',
            'fictional-key',
            { max: 5, window: 60 },
          ),
        ),
      );
      assert.equal(results.filter((r) => r.allowed).length, 5);
      assert.equal(
        results.filter((r) => !r.allowed && r.retryAfter === 60).length,
        95,
      );
      now += 60000;
      assert.equal(
        (
          await x.runtime.auth.security.consume(
            'concurrency-fixture',
            'fictional-key',
            { max: 5, window: 60 },
          )
        ).allowed,
        true,
      );
    },
  );
  await t.test(
    'rate database outage fails closed without exposing SQL or raw secrets',
    async () => {
      await f.pool.query(
        'ALTER TABLE security_rate_limits RENAME TO unavailable_security_fixture',
      );
      const r = await x.app.inject({ url: '/v1/me', headers: { cookie } });
      assert.equal(r.statusCode, 500);
      assert.equal(r.json().error.code, 'INTERNAL_ERROR');
      assert.equal(r.headers['cache-control'], 'no-store');
      const login = await x.app.inject({
        method: 'POST',
        url: '/api/auth/sign-in/email',
        payload: { email: 'durable@example.test', password },
        headers: { origin: authConfig.appOrigin },
      });
      assert.equal(login.statusCode, 500);
      assert.equal(login.json().code, 'INTERNAL_SERVER_ERROR');
      assert.doesNotMatch(
        r.body + login.body,
        /SELECT|INSERT|security_rate|postgres|password|@example/,
      );
      assert.equal((await x.app.inject('/live')).statusCode, 200);
      await f.pool.query(
        'ALTER TABLE unavailable_security_fixture RENAME TO security_rate_limits',
      );
    },
  );
  // Close independent pools before the disposable database is dropped.
  await Promise.all([x.close(), y.close()]);
});
