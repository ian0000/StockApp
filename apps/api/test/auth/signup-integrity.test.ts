import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authFixture, password } from './helpers.js';

for (const verified of [false, true]) {
  test(`duplicate signup cannot replace ${verified ? 'verified' : 'unverified'} account credentials or start a session`, async (t) => {
    const f = await authFixture(t);
    const email = `duplicate-${verified ? 'verified' : 'unverified'}@example.test`;
    const attemptedPassword = 'fictional-duplicate-replacement-password';
    await f.signup(email);
    if (verified) await f.verify(email);
    const original = await f.pool.query<{
      id: string;
      name: string;
      email_verified: boolean;
      account_id: string;
      password: string;
      updated_at: Date;
    }>(
      `SELECT u.id,u.name,u.email_verified,a.id AS account_id,a.password,a.updated_at
       FROM "user" u JOIN account a ON a.user_id=u.id
       WHERE u.email=$1 AND a.provider_id='credential'`,
      [email],
    );
    assert.equal(original.rows.length, 1);
    assert.ok(original.rows[0].password);
    assert.notEqual(original.rows[0].password, password);
    const messages = f.messages.length;
    const duplicate = await f.post('sign-up/email', {
      email: email.toUpperCase(),
      password: attemptedPassword,
      name: 'Fictional duplicate name',
    });
    await f.runtime.drainEmails();
    assert.equal(duplicate.statusCode, 200);
    assert.equal(duplicate.json().token, null);
    assert.equal(duplicate.json().user.emailVerified, false);
    assert.equal(duplicate.headers['set-cookie'], undefined);
    assert.notEqual(duplicate.json().user.id, original.rows[0].id);
    const after = await f.pool.query(
      `SELECT u.id,u.name,u.email_verified,a.id AS account_id,a.password,a.updated_at
       FROM "user" u JOIN account a ON a.user_id=u.id
       WHERE u.email=$1 AND a.provider_id='credential'`,
      [email],
    );
    assert.deepEqual(after.rows, original.rows);
    assert.equal(f.messages.length, messages);
    assert.equal((await f.pool.query('SELECT id FROM session')).rowCount, 0);
    assert.equal(
      (await f.post('sign-in/email', { email, password: attemptedPassword }))
        .statusCode,
      401,
    );
    if (!verified) await f.verify(email);
    assert.equal((await f.signin(email, password)).result.statusCode, 200);
    assert.equal(
      (await f.post('sign-in/email', { email, password: attemptedPassword }))
        .statusCode,
      401,
    );
    for (const secret of [
      password,
      attemptedPassword,
      original.rows[0].password,
    ])
      assert.equal(f.logs.join('').includes(secret), false);
  });
}

test('anonymous verification resend does not enumerate verified or missing accounts and only queues for unverified accounts', async (t) => {
  const f = await authFixture(t);
  await f.signup('verified-resend@example.test');
  await f.verify('verified-resend@example.test');
  await f.signup('unverified-resend@example.test');
  const before = f.messages.length;
  const results = [];
  for (const email of [
    'verified-resend@example.test',
    'missing-resend@example.test',
    'unverified-resend@example.test',
  ]) {
    results.push(await f.post('send-verification-email', { email }));
  }
  await f.runtime.drainEmails();
  for (const result of results) {
    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.json(), { status: true });
    assert.equal(result.headers['set-cookie'], undefined);
  }
  assert.equal(f.messages.length, before + 1);
  assert.equal(f.messages.at(-1)?.to, 'unverified-resend@example.test');
});
