import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deletionFixture } from './helpers.js';
import { id } from '../postgres/helpers.js';

test('existing durable command rate, strict query/media/body and redaction apply to deletion', async (t) => {
  const f = await deletionFixture(t),
    a = await f.identity('limits'),
    token = await f.csrf(a.cookie);
  const request = {
    method: 'POST' as const,
    url: '/v1/me/deletion',
    payload: {},
    headers: {
      cookie: a.cookie,
      'idempotency-key': 'invalid-key',
      'x-csrf-token': token,
    },
  };
  assert.equal(
    (await f.app.inject({ ...request, url: '/v1/me/deletion?userId=foreign' }))
      .statusCode,
    400,
  );
  assert.equal(
    (
      await f.app.inject({
        ...request,
        payload: 'text',
        headers: { ...request.headers, 'content-type': 'text/plain' },
      })
    ).statusCode,
    415,
  );
  assert.equal(
    (
      await f.app.inject({
        ...request,
        payload: 'x'.repeat(1024 * 1024 + 1),
        headers: { ...request.headers, 'content-type': 'application/json' },
      })
    ).statusCode,
    413,
  );
  for (let i = 0; i < 60; i++)
    assert.equal((await f.app.inject(request)).statusCode, 400);
  const limited = await f.app.inject(request);
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.json().error.code, 'RATE_LIMITED');
  assert.ok(Number(limited.headers['retry-after']) > 0);
  assert.equal(
    (await f.pool.query('SELECT id FROM deletion_requests')).rowCount,
    0,
  );
  assert.doesNotMatch(
    f.logs.join(''),
    new RegExp(
      `${a.email}|${a.authenticated.user.id}|invalid-key|${f.keys.suppressionSecret}`,
    ),
  );
});

test('official new sign-in concurrent with deletion may authenticate but never reopens dataset', async (t) => {
  const f = await deletionFixture(t),
    a = await f.owner('signin-race'),
    token = await f.csrf(a.cookie);
  const [accepted, login] = await Promise.all([
    f.request(a.cookie, id(), token),
    f.signin(a.email),
  ]);
  assert.equal(accepted.statusCode, 202);
  assert.equal(login.result.statusCode, 200);
  const session = await f.session(login.cookie);
  if (session.json() === null) {
    assert.equal(
      (
        await f.app.inject({
          url: `/v1/inventories/${a.context.inventory.id}`,
          headers: { cookie: login.cookie },
        })
      ).statusCode,
      401,
    );
  } else {
    const blocked = await f.app.inject({
      url: `/v1/inventories/${a.context.inventory.id}`,
      headers: { cookie: login.cookie },
    });
    assert.equal(blocked.statusCode, 403);
    assert.equal(blocked.json().error.code, 'CLOUD_ACCESS_DISABLED');
  }
  assert.equal(
    (
      await f.pool.query(
        'SELECT status,cloud_access_enabled FROM businesses WHERE id=$1',
        [a.context.business.id],
      )
    ).rows[0].cloud_access_enabled,
    false,
  );
});
