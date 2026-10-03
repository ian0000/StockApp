import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authFixture, password } from './helpers.js';

test('password reset is non-enumerating, one-time, expires and revokes all sessions', async (t) => {
  const f = await authFixture(t);
  const email = 'reset@example.test';
  const newPassword = 'fictional-new-password-for-tests';
  await f.signup(email);
  await f.verify(email);
  const first = await f.signin(email);
  const second = await f.signin(email);
  let resetToken = '';
  await t.test(
    'existing and missing reset requests share status and public body',
    async () => {
      const existing = await f.post('request-password-reset', {
        email,
        redirectTo: f.config.appOrigin + '/reset',
      });
      const missing = await f.post('request-password-reset', {
        email: 'missing@example.test',
        redirectTo: f.config.appOrigin + '/reset',
      });
      assert.equal(existing.statusCode, 200);
      assert.equal(missing.statusCode, existing.statusCode);
      assert.deepEqual(missing.json(), existing.json());
      await f.runtime.drainEmails();
      assert.equal(
        f.messages.filter((message) => message.to === 'missing@example.test')
          .length,
        0,
      );
      const link = f.emailLink(email, 'reset');
      assert.equal(link.origin, f.config.baseURL);
      resetToken = link.pathname.split('/').at(-1) ?? '';
      assert.ok(resetToken);
      const record = (
        await f.pool.query<{ expires_at: Date; created_at: Date }>(
          'SELECT expires_at,created_at FROM verification WHERE identifier=$1',
          [`reset-password:${resetToken}`],
        )
      ).rows[0];
      assert.ok(
        Math.abs(
          record.expires_at.getTime() - record.created_at.getTime() - 1800000,
        ) < 1000,
      );
      const redirect = await f.app.inject(link.pathname + link.search);
      assert.equal(redirect.statusCode, 302);
      assert.equal(
        new URL(String(redirect.headers.location)).origin,
        f.config.appOrigin,
      );
      assert.equal(
        new URL(String(redirect.headers.location)).searchParams.get('token'),
        resetToken,
      );
      link.searchParams.set('callbackURL', 'https://evil.example.test');
      assert.equal(
        (await f.app.inject(link.pathname + link.search)).statusCode,
        403,
      );
    },
  );
  await t.test(
    'valid reset changes password and revokes every previous session',
    async () => {
      const reset = await f.post('reset-password', {
        token: resetToken,
        newPassword,
      });
      assert.equal(reset.statusCode, 200);
      assert.equal((await f.session(first.cookie)).json(), null);
      assert.equal((await f.session(second.cookie)).json(), null);
      assert.equal((await f.pool.query('SELECT id FROM session')).rowCount, 0);
      assert.equal(
        (await f.post('sign-in/email', { email, password })).statusCode,
        401,
      );
      assert.equal((await f.signin(email, newPassword)).result.statusCode, 200);
      assert.equal(f.logs.join('').includes(newPassword), false);
      assert.equal(f.logs.join('').includes(resetToken), false);
    },
  );
  await t.test(
    'consumed reset token cannot change password again',
    async () => {
      assert.equal(
        (
          await f.post('reset-password', {
            token: resetToken,
            newPassword: password,
          })
        ).statusCode,
        400,
      );
      assert.equal((await f.signin(email, newPassword)).result.statusCode, 200);
    },
  );
  await t.test(
    'expired reset token cannot change password or revoke a valid session',
    async () => {
      const current = await f.signin(email, newPassword);
      await f.post('request-password-reset', { email });
      await f.runtime.drainEmails();
      const link = f.emailLink(email, 'reset');
      const expiredToken = link.pathname.split('/').at(-1);
      await f.pool.query(
        "UPDATE verification SET expires_at=now()-interval '1 second' WHERE identifier=$1",
        [`reset-password:${expiredToken}`],
      );
      assert.equal(
        (
          await f.post('reset-password', {
            token: expiredToken,
            newPassword: password,
          })
        ).statusCode,
        400,
      );
      assert.equal((await f.session(current.cookie)).json().user.email, email);
      assert.equal((await f.signin(email, newPassword)).result.statusCode, 200);
    },
  );
});
