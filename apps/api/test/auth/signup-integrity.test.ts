import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authFixture, password } from './helpers.js';

test('PostgreSQL rejects case variants at the identity boundary', async (t) => {
  const f = await authFixture(t);
  await f.signup('Case-Identity@Example.Test');
  assert.deepEqual((await f.pool.query('SELECT email FROM "user"')).rows, [
    { email: 'case-identity@example.test' },
  ]);
  await assert.rejects(
    f.pool.query('INSERT INTO "user" (id, name, email) VALUES ($1, $2, $3)', [
      'synthetic-different-id',
      'Synthetic profile',
      'CASE-IDENTITY@example.test',
    ]),
    { code: '23505', constraint: 'user_email_normalized_unique' },
  );
});

test('two concurrent signups return the same public shape and persist one identity, credential and email', async (t) => {
  const f = await authFixture(t, {}, () => Date.now());
  const blocker = await f.pool.connect();
  const email = 'race@example.test';
  const passwords = [password, 'fictional-other-password'];
  await blocker.query('BEGIN');
  let requests: ReturnType<typeof f.post>[] = [];
  try {
    // Both requests pass the existence check before either can insert its user.
    await blocker.query('LOCK TABLE "user" IN SHARE MODE');
    requests = passwords.map((value, i) =>
      f.post('sign-up/email', {
        email: i === 0 ? email : email.toUpperCase(),
        name: `Synthetic profile ${i}`,
        password: value,
      }),
    );
    const deadline = Date.now() + 5000;
    for (;;) {
      const { rows } = await blocker.query<{ waiting: number }>(`
        SELECT count(*)::int AS waiting FROM pg_locks
        WHERE relation = '"user"'::regclass AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
          AND mode = 'RowExclusiveLock' AND NOT granted`);
      if (rows[0].waiting === 2) break;
      assert.ok(Date.now() < deadline, 'both inserts must be pending');
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
  } finally {
    await blocker.query('ROLLBACK');
    blocker.release();
    await Promise.allSettled(requests);
  }
  const replies = await Promise.all(requests);
  await f.runtime.drainEmails();
  const users = await f.pool.query<{ id: string; email: string; name: string }>(
    'SELECT id, email, name FROM "user"',
  );
  assert.equal(users.rowCount, 1);
  assert.equal(users.rows[0].email, email);
  assert.equal(
    (
      await f.pool.query(
        'SELECT id FROM account WHERE user_id = $1 AND provider_id = $2',
        [users.rows[0].id, 'credential'],
      )
    ).rowCount,
    1,
  );
  assert.equal((await f.pool.query('SELECT id FROM session')).rowCount, 0);
  assert.equal(f.messages.length, 1);
  assert.equal(f.messages[0].to, email);
  for (const reply of replies) {
    assert.equal(reply.statusCode, 200);
    assert.equal(reply.headers['set-cookie'], undefined);
    assert.equal(reply.json().token, null);
    assert.equal(reply.json().user.emailVerified, false);
  }
  assert.deepEqual(
    Object.keys(replies[0].json().user).sort(),
    Object.keys(replies[1].json().user).sort(),
  );
  assert.equal(
    replies.filter((reply) => reply.json().user.id === users.rows[0].id).length,
    1,
  );
  const winner = replies.findIndex(
    (reply) => reply.json().user.id === users.rows[0].id,
  );
  await f.verify(email);
  await f.signin(email, passwords[winner]);
  assert.equal(
    (await f.post('sign-in/email', { email, password: passwords[1 - winner] }))
      .statusCode,
    401,
  );
});

for (const verified of [false, true]) {
  test(`duplicate signup cannot replace ${verified ? 'verified' : 'unverified'} account credentials or start a session`, async (t) => {
    const f = await authFixture(t);
    const email = `duplicate-${verified ? 'verified' : 'unverified'}@example.test`;
    const attemptedPassword = 'fictional-duplicate-replacement-password';
    await f.signup(email);
    if (verified) await f.verify(email);
    const active = verified ? await f.signin(email) : null;
    const sessionsBefore = (
      await f.pool.query(
        'SELECT id, user_id, expires_at, updated_at FROM session',
      )
    ).rows;
    const original = await f.pool.query<{
      id: string;
      name: string;
      email_verified: boolean;
      account_id: string;
      password: string;
      updated_at: Date;
    }>(
      `SELECT u.id,u.name,u.email,u.image,u.email_verified,u.updated_at AS profile_updated_at,a.id AS account_id,a.password,a.updated_at
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
      image: 'https://example.test/changed-avatar.png',
    });
    await f.runtime.drainEmails();
    assert.equal(duplicate.statusCode, 200);
    assert.equal(duplicate.json().token, null);
    assert.equal(duplicate.json().user.emailVerified, false);
    assert.equal(duplicate.headers['set-cookie'], undefined);
    assert.notEqual(duplicate.json().user.id, original.rows[0].id);
    const after = await f.pool.query(
      `SELECT u.id,u.name,u.email,u.image,u.email_verified,u.updated_at AS profile_updated_at,a.id AS account_id,a.password,a.updated_at
       FROM "user" u JOIN account a ON a.user_id=u.id
       WHERE u.email=$1 AND a.provider_id='credential'`,
      [email],
    );
    assert.deepEqual(after.rows, original.rows);
    assert.equal(f.messages.length, messages);
    assert.deepEqual(
      (
        await f.pool.query(
          'SELECT id, user_id, expires_at, updated_at FROM session',
        )
      ).rows,
      sessionsBefore,
    );
    if (active)
      assert.equal(
        (await f.session(active.cookie)).json().user.id,
        original.rows[0].id,
      );
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

test('verification resend limits normalized addresses across IPs and prevents a signed-in user from sending for another email', async (t) => {
  let now = Date.now();
  const f = await authFixture(t, {}, () => now);
  const unverified = 'resend-limit@example.test';
  const verified = 'resend-owner@example.test';
  await f.signup(unverified);
  await f.signup(verified);
  await f.verify(verified);
  const { cookie } = await f.signin(verified);
  const before = f.messages.length;
  const denied = await f.post(
    'send-verification-email',
    { email: unverified },
    cookie,
  );
  assert.equal(denied.statusCode, 400);
  await f.runtime.drainEmails();
  assert.equal(f.messages.length, before);
  // Start an independent resend window after the authenticated rejection.
  now += 3_600_000;
  const rateLimited = [];
  for (const email of [unverified, verified, 'resend-missing@example.test']) {
    for (let i = 0; i < 4; i++) {
      const result = await f.app.inject({
        method: 'POST',
        url: '/api/auth/send-verification-email',
        remoteAddress: `192.0.2.${i + 1}`,
        headers: { origin: f.config.appOrigin },
        payload: { email: i % 2 ? email.toUpperCase() : email },
      });
      assert.equal(result.statusCode, i < 3 ? 200 : 429);
      if (i < 3) assert.deepEqual(result.json(), { status: true });
      else {
        assert.equal(result.headers['x-retry-after'], '3600');
        rateLimited.push(result.json());
      }
    }
  }
  await f.runtime.drainEmails();
  assert.deepEqual(rateLimited, Array(3).fill(rateLimited[0]));
  assert.deepEqual(
    f.messages.slice(before).map(({ to }) => to),
    Array(3).fill(unverified),
  );
});
