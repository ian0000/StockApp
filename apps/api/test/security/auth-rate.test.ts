import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authFixture, password } from '../auth/helpers.js';

test('durable auth limits normalize email, resist IP header spoofing and preserve non-enumeration', async (t) => {
  let now = Date.now();
  const f = await authFixture(t, {}, () => now);
  await f.signup('rate-existing@example.test');
  await f.verify('rate-existing@example.test');
  await t.test(
    'existing and absent emails each allow five failed logins, then identical generic 429',
    async () => {
      const bodies: unknown[] = [];
      for (const email of [
        'rate-existing@example.test',
        'rate-absent@example.test',
      ]) {
        now += 60001;
        for (let i = 0; i < 5; i++) {
          const r = await f.post('sign-in/email', {
            email: i % 2 ? email.toUpperCase() : email,
            password: 'fictional-wrong-password',
          });
          assert.equal(r.statusCode, 401, r.body);
        }
        const r = await f.post('sign-in/email', { email, password });
        assert.equal(r.statusCode, 429);
        assert.equal(r.headers['x-retry-after'], '60');
        assert.equal(r.headers['cache-control'], 'no-store');
        bodies.push(r.json());
      }
      assert.deepEqual(bodies[0], bodies[1]);
    },
  );
  await t.test(
    'trimmed email attempts use the same counter without Gmail-style canonicalization',
    async () => {
      now += 60001;
      for (let i = 0; i < 5; i++)
        await f.post('sign-in/email', {
          email: '  rate-existing@example.test  ',
          password,
        });
      assert.equal(
        (
          await f.post('sign-in/email', {
            email: 'rate-existing@example.test',
            password,
          })
        ).statusCode,
        429,
      );
      now += 60001;
      assert.equal(
        (
          await f.post('sign-in/email', {
            email: 'rate-existing@example.test',
            password,
          })
        ).statusCode,
        200,
      );
    },
  );
  await t.test(
    'successful login never clears the email attempt counter',
    async () => {
      now += 60001;
      for (let i = 0; i < 5; i++)
        assert.equal(
          (
            await f.post('sign-in/email', {
              email: 'rate-existing@example.test',
              password,
            })
          ).statusCode,
          200,
        );
      assert.equal(
        (
          await f.post('sign-in/email', {
            email: 'rate-existing@example.test',
            password,
          })
        ).statusCode,
        429,
      );
    },
  );
  await t.test(
    'existing and absent reset emails allow three/hour, then identical 429; expiry resets',
    async () => {
      const bodies: unknown[] = [];
      for (const email of [
        'rate-existing@example.test',
        'rate-absent@example.test',
      ]) {
        now += 60001;
        for (let i = 0; i < 3; i++) {
          const r = await f.post('request-password-reset', { email });
          assert.equal(r.statusCode, 200);
          bodies.push(r.json());
        }
        const r = await f.post('request-password-reset', {
          email: email.toUpperCase(),
        });
        assert.equal(r.statusCode, 429);
        assert.equal(r.headers['x-retry-after'], '3600');
      }
      for (const body of bodies) assert.deepEqual(body, bodies[0]);
      now += 3600000;
      assert.equal(
        (
          await f.post('request-password-reset', {
            email: 'rate-existing@example.test',
          })
        ).statusCode,
        200,
      );
    },
  );
  await t.test(
    '30 sensitive auth attempts share a socket-IP bucket despite spoofed headers',
    async () => {
      now += 60001;
      for (let i = 0; i < 30; i++) {
        const r = await f.post(
          'send-verification-email',
          { email: `missing-${i}@example.test` },
          undefined,
          {
            'x-forwarded-for': `192.0.2.${i + 1}`,
            'cf-connecting-ip': `198.51.100.${i + 1}`,
            'x-stockapp-client-ip': `203.0.113.${i + 1}`,
          },
        );
        assert.equal(r.statusCode, 200, r.body);
      }
      assert.equal(
        (
          await f.post(
            'request-password-reset',
            { email: 'different@example.test' },
            undefined,
            { 'x-stockapp-client-ip': '203.0.113.200' },
          )
        ).statusCode,
        429,
      );
      const otherSocket = await f.app.inject({
        method: 'POST',
        url: '/api/auth/send-verification-email',
        remoteAddress: '192.0.2.250',
        headers: { origin: f.config.appOrigin },
        payload: { email: 'other-socket@example.test' },
      });
      assert.equal(otherSocket.statusCode, 200);
      now += 60000;
      assert.equal(
        (
          await f.post('send-verification-email', {
            email: 'missing@example.test',
          })
        ).statusCode,
        200,
      );
    },
  );
  await t.test(
    'official Better Auth custom consume uses trusted IP header and X-Retry-After',
    async () => {
      now += 60001;
      for (let i = 0; i < 30; i++)
        assert.equal(
          (
            await f.app.inject({
              url: '/api/auth/get-session',
              headers: {
                'x-stockapp-client-ip': `192.0.2.${i + 1}`,
                'x-forwarded-for': `192.0.2.${i + 1}`,
              },
            })
          ).statusCode,
          200,
        );
      const r = await f.app.inject('/api/auth/get-session');
      assert.equal(r.statusCode, 429);
      assert.equal(r.headers['x-retry-after'], '60');
      assert.equal(
        (
          await f.app.inject({
            url: '/api/auth/get-session',
            remoteAddress: '192.0.2.250',
          })
        ).statusCode,
        200,
      );
    },
  );
  await t.test(
    'security table stores only scope, keyed hash, bounded count and expiration',
    async () => {
      const rows = (await f.pool.query('SELECT * FROM security_rate_limits'))
        .rows;
      assert.ok(rows.length > 0);
      for (const row of rows) {
        assert.deepEqual(
          Object.keys(row).sort(),
          ['scope', 'key_hash', 'count', 'expires_at'].sort(),
        );
        assert.match(row.key_hash, /^[a-f0-9]{64}$/);
      }
      assert.doesNotMatch(
        JSON.stringify(rows),
        /@example.test|127\.0\.0\.1|192\.0\.2|fictional-password/,
      );
    },
  );
});
