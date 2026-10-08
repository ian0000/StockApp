import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contractSchemas, createSchemaValidator } from '@stock-app/contracts';
import { deletionFixture } from './helpers.js';
import { id } from '../postgres/helpers.js';

test('deletion accepts identity without Business, revokes real sessions and recovers lost ACK through official reauthentication', async (t) => {
  const f = await deletionFixture(t),
    a = await f.identity('no-business'),
    other = await f.signin(a.email),
    key = id();
  const accepted = await f.request(a.cookie, key);
  assert.equal(accepted.statusCode, 202);
  createSchemaValidator(contractSchemas.AccountDeletionResult)(accepted.json());
  assert.equal(accepted.json().sessionsRevoked, true);
  assert.equal(accepted.headers['cache-control'], 'no-store');
  assert.ok(accepted.headers['x-request-id']);
  assert.equal((await f.session(a.cookie)).json(), null);
  assert.equal((await f.session(other.cookie)).json(), null);
  const lost = await f.request(a.cookie, key, 'x'.repeat(43));
  assert.equal(lost.statusCode, 401);
  assert.equal(lost.json().error.code, 'UNAUTHENTICATED');
  const fresh = await f.signin(a.email);
  assert.equal(
    (await f.app.inject({ url: '/v1/me', headers: { cookie: fresh.cookie } }))
      .statusCode,
    200,
  );
  assert.equal(
    (
      await f.app.inject({
        url: '/v1/me/export',
        headers: { cookie: fresh.cookie },
      })
    ).statusCode,
    403,
  );
  const token = await f.csrf(fresh.cookie);
  const bootstrap = await f.app.inject({
    method: 'POST',
    url: '/v1/business',
    headers: { cookie: fresh.cookie, 'x-csrf-token': token },
    payload: {
      inventoryName: 'No reopening',
      currency: 'USD',
      reportingTimeZone: 'UTC',
    },
  });
  assert.equal(bootstrap.statusCode, 403);
  const replay = await f.request(fresh.cookie, key, token);
  assert.equal(replay.statusCode, 202);
  assert.deepEqual(replay.json(), accepted.json());
  const newLogin = await f.signin(a.email);
  assert.deepEqual(
    (await f.request(newLogin.cookie, id())).json(),
    accepted.json(),
  );
  assert.equal(
    (await f.pool.query('SELECT id FROM deletion_requests')).rowCount,
    1,
  );
  await f.purge(key);
  assert.equal(
    (
      await f.post('sign-in/email', {
        email: a.email,
        password: 'fictional-password-for-tests',
      })
    ).statusCode,
    401,
  );
  const row = (await f.pool.query('SELECT * FROM deletion_requests')).rows[0];
  assert.equal(row.status, 'COMPLETED');
  assert.equal(row.user_id, null);
  assert.doesNotMatch(JSON.stringify(row), new RegExp(a.email));
  assert.match(row.suppression_identifier, /^[a-f0-9]{64}$/);
});

test('inclusive recent auth, strict body, UUIDv7 key, CSRF/Origin, verified email and no anonymous authority', async (t) => {
  const f = await deletionFixture(t);
  for (const age of [299999, 300000, 300001]) {
    const a = await f.identity(`age-${age}`),
      key = id();
    f.setClock(a.authenticated.session.createdAt.getTime() + age);
    const result = await f.request(a.cookie, key);
    assert.equal(result.statusCode, age <= 300000 ? 202 : 403);
    if (age > 300000)
      assert.equal(result.json().error.code, 'SESSION_NOT_FRESH');
  }
  const a = await f.identity('security'),
    token = await f.csrf(a.cookie),
    key = id();
  const base = {
    method: 'POST' as const,
    url: '/v1/me/deletion',
    payload: {},
    headers: {
      cookie: a.cookie,
      'x-csrf-token': token,
      'idempotency-key': key,
    },
  };
  for (const bad of [
    undefined,
    'bad',
    '550e8400-e29b-41d4-a716-446655440000',
  ]) {
    const headers: Record<string, string> = {
      cookie: a.cookie,
      'x-csrf-token': token,
    };
    if (bad) headers['idempotency-key'] = bad;
    assert.equal((await f.app.inject({ ...base, headers })).statusCode, 400);
  }
  assert.equal(
    (await f.app.inject({ ...base, payload: { userId: 'foreign' } }))
      .statusCode,
    400,
  );
  assert.equal(
    (
      await f.app.inject({
        ...base,
        headers: { ...base.headers, 'x-csrf-token': 'wrong' },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await f.app.inject({
        ...base,
        headers: { ...base.headers, origin: 'https://evil.example.test' },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (await f.app.inject({ ...base, headers: { 'idempotency-key': key } }))
      .statusCode,
    401,
  );
  await f.pool.query('UPDATE "user" SET email_verified=false WHERE id=$1', [
    a.authenticated.user.id,
  ]);
  assert.equal((await f.app.inject(base)).statusCode, 403);
  assert.equal(
    (await f.pool.query('SELECT id FROM deletion_requests WHERE id=$1', [key]))
      .rowCount,
    0,
  );
});

test('ACTIVE dataset logically revoked, new official sign-in permits only recovery and foreign key does not leak', async (t) => {
  const f = await deletionFixture(t),
    a = await f.owner('active-a'),
    b = await f.owner('active-b'),
    key = id();
  assert.equal((await f.request(a.cookie, key)).statusCode, 202);
  const row = (
    await f.pool.query(
      'SELECT status,cloud_access_enabled FROM businesses WHERE id=$1',
      [a.context.business.id],
    )
  ).rows[0];
  assert.deepEqual(row, { status: 'DELETING', cloud_access_enabled: false });
  const fresh = await f.signin(a.email);
  for (const url of [
    `/v1/inventories/${a.context.inventory.id}`,
    `/v1/inventories/${a.context.inventory.id}/backup`,
    '/v1/me/export',
  ]) {
    const response = await f.app.inject({
      url,
      headers: { cookie: fresh.cookie },
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error.code, 'CLOUD_ACCESS_DISABLED');
  }
  const mismatch = await f.request(b.cookie, key);
  assert.equal(mismatch.statusCode, 409);
  assert.equal(mismatch.json().error.code, 'IDEMPOTENCY_KEY_REUSED');
  assert.doesNotMatch(mismatch.body, new RegExp(a.authenticated.user.id));
  assert.ok((await f.session(b.cookie)).json());
  assert.equal(
    (
      await f.pool.query('SELECT status FROM businesses WHERE id=$1', [
        b.context.business.id,
      ])
    ).rows[0].status,
    'ACTIVE',
  );
  assert.equal((await f.post('delete-user', {}, fresh.cookie)).statusCode, 404);
  assert.equal((await f.app.inject('/v1/me/deletion')).statusCode, 404);
});

test('acceptance failure rolls back Business, durable request and all sessions together', async (t) => {
  const f = await deletionFixture(t),
    a = await f.owner('rollback'),
    key = id();
  await f.pool.query(
    "CREATE FUNCTION fail_deletion_session() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fictional failure'; END $$; CREATE TRIGGER fail_deletion BEFORE DELETE ON session FOR EACH STATEMENT EXECUTE FUNCTION fail_deletion_session()",
  );
  const failed = await f.request(a.cookie, key);
  assert.equal(failed.statusCode, 500);
  assert.equal(
    (await f.pool.query('SELECT id FROM deletion_requests')).rowCount,
    0,
  );
  assert.equal(
    (
      await f.pool.query('SELECT status FROM businesses WHERE id=$1', [
        a.context.business.id,
      ])
    ).rows[0].status,
    'ACTIVE',
  );
  assert.ok((await f.session(a.cookie)).json());
  assert.doesNotMatch(failed.body, /fictional failure|session|SQL/i);
  await f.pool.query(
    'DROP TRIGGER fail_deletion ON session; DROP FUNCTION fail_deletion_session()',
  );
  assert.equal((await f.request(a.cookie, key)).statusCode, 202);
});
