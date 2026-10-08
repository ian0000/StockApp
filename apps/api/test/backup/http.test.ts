import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contractSchemas, createSchemaValidator } from '@stock-app/contracts';
import { parseBackupV1 } from '@stock-app/application';
import { backupFixture } from './helpers.js';
import { id } from '../postgres/helpers.js';

test('official auth uses inclusive createdAt recency, not ordinary activity or updatedAt; expired/revoked/unverified sessions fail correctly', async (t) => {
  const f = await backupFixture(t),
    a = await f.owner('auth');
  const paths = [
    '/v1/me/export',
    `/v1/inventories/${a.context.inventory.id}/backup`,
  ];
  const get = (path: string, cookie = a.cookie) =>
    f.app.inject({ url: path, headers: { cookie } });
  for (const path of paths) {
    await t.test(`${path} rejects missing session`, async () => {
      const response = await get(path, '');
      assert.equal(response.statusCode, 401);
      assert.equal(response.json().error.code, 'UNAUTHENTICATED');
      createSchemaValidator(contractSchemas.ApiError)(response.json());
    });
    for (const age of [299999, 300000, 300001])
      await t.test(`${path} auth age ${age}`, async () => {
        await f.pool.query(
          'UPDATE session SET created_at=$1,updated_at=$2 WHERE id=$3',
          [
            new Date(f.clock() - age).toISOString(),
            new Date(f.clock()).toISOString(),
            a.authenticated.session.id,
          ],
        );
        const response = await get(path);
        assert.equal(response.statusCode, age <= 300000 ? 200 : 403);
        if (age > 300000) {
          assert.equal(response.json().error.code, 'SESSION_NOT_FRESH');
          createSchemaValidator(contractSchemas.ApiError)(response.json());
          assert.deepEqual(Object.keys(response.json().error).sort(), [
            'code',
            'message',
            'requestId',
          ]);
        }
      });
  }
  await t.test(
    'ordinary get-session activity does not refresh createdAt recency',
    async () => {
      const before = await f.pool.query(
        'SELECT created_at FROM session WHERE id=$1',
        [a.authenticated.session.id],
      );
      assert.equal((await f.session(a.cookie)).statusCode, 200);
      const after = await f.pool.query(
        'SELECT created_at FROM session WHERE id=$1',
        [a.authenticated.session.id],
      );
      assert.deepEqual(before.rows, after.rows);
      assert.equal(
        (await get(paths[0])).json().error.code,
        'SESSION_NOT_FRESH',
      );
    },
  );
  await t.test(
    'new official sign-in is fresh; unverified identity remains forbidden',
    async () => {
      const login = await f.signin(a.email);
      f.setClock(Date.now());
      assert.equal((await get(paths[0], login.cookie)).statusCode, 200);
      await f.pool.query('UPDATE "user" SET email_verified=false WHERE id=$1', [
        a.authenticated.user.id,
      ]);
      const response = await get(paths[0], login.cookie);
      assert.equal(response.statusCode, 403);
      assert.equal(response.json().error.code, 'EMAIL_NOT_VERIFIED');
      await f.pool.query('UPDATE "user" SET email_verified=true WHERE id=$1', [
        a.authenticated.user.id,
      ]);
    },
  );
  await t.test('expired official session returns 401', async () => {
    await f.pool.query('UPDATE session SET expires_at=$1 WHERE id=$2', [
      new Date(Date.now() - 1000).toISOString(),
      a.authenticated.session.id,
    ]);
    assert.equal((await get(paths[0])).statusCode, 401);
  });
  await t.test('official revocation returns 401', async () => {
    const login = await f.signin(a.email);
    f.setClock(Date.now());
    assert.equal((await f.post('sign-out', {}, login.cookie)).statusCode, 200);
    assert.equal((await get(paths[0], login.cookie)).statusCode, 401);
  });
});

test('account portability covers no Business/no Inventory/pilot disabled/DELETING, while private backup enforces the cloud boundary', async (t) => {
  const f = await backupFixture(t),
    a = await f.owner('lifecycle-a'),
    b = await f.identity('lifecycle-empty');
  const get = (path: string, cookie = a.cookie) =>
    f.app.inject({ url: path, headers: { cookie } });
  await t.test(
    'no Business exports only own identity and null backup',
    async () => {
      const response = await get('/v1/me/export', b.cookie);
      assert.equal(response.statusCode, 200);
      createSchemaValidator(contractSchemas.AccountExport)(response.json());
      assert.deepEqual(response.json(), {
        user: {
          id: b.authenticated.user.id,
          email: b.email,
          emailVerified: true,
        },
        backup: null,
        exportedAt: f.clock(),
      });
    },
  );
  await f.pool.query(
    'INSERT INTO businesses(id,owner_user_id,status,cloud_access_enabled) VALUES($1,$2,$3,$4)',
    [id(), b.authenticated.user.id, 'ACTIVE', false],
  );
  await t.test(
    'ACTIVE Business without Inventory also exports null',
    async () => {
      const response = await get('/v1/me/export', b.cookie);
      assert.equal(response.statusCode, 200);
      assert.equal(response.json().backup, null);
    },
  );
  await f.pool.query(
    'UPDATE businesses SET cloud_access_enabled=false WHERE id=$1',
    [a.context.business.id],
  );
  await t.test(
    'pilot-disabled own export succeeds and private backup stays forbidden',
    async () => {
      const response = await get('/v1/me/export');
      assert.equal(response.statusCode, 200);
      assert.equal(response.json().backup.inventoryId, a.context.inventory.id);
      const backup = await get(
        `/v1/inventories/${a.context.inventory.id}/backup`,
      );
      assert.equal(backup.statusCode, 403);
      assert.equal(backup.json().error.code, 'CLOUD_ACCESS_DISABLED');
    },
  );
  await f.pool.query(
    "UPDATE businesses SET status='DELETING',cloud_access_enabled=true WHERE id=$1",
    [a.context.business.id],
  );
  for (const path of [
    '/v1/me/export',
    `/v1/inventories/${a.context.inventory.id}/backup`,
  ])
    await t.test(`DELETING blocks ${path}`, async () => {
      const response = await get(path);
      assert.equal(response.statusCode, 403);
      assert.equal(response.json().error.code, 'CLOUD_ACCESS_DISABLED');
      assert.equal(Object.hasOwn(response.json(), 'backup'), false);
    });
});

test('HTTP exports validate exact raw BackupV1 and AccountExport, safe filename/headers, eight-table A/B isolation, no writes or payload logging', async (t) => {
  const f = await backupFixture(t),
    a = await f.owner('http-a'),
    b = await f.owner('http-b');
  await f.history(a.context, 'HTTP_A');
  await f.history(b.context, 'HTTP_B');
  const path = `/v1/inventories/${a.context.inventory.id}/backup`;
  const counts = () =>
    f.pool.query(
      'SELECT (SELECT count(*) FROM operation_receipts) receipts,(SELECT count(*) FROM inventory_change_sets) changes,(SELECT sum(revision) FROM inventories) revision',
    );
  const before = (await counts()).rows;
  const backup = await f.app.inject({
    url: path,
    headers: { cookie: a.cookie, 'x-csrf-token': 'irrelevant-get-value' },
  });
  assert.equal(backup.statusCode, 200);
  assert.match(
    String(backup.headers['content-type']),
    /^application\/json(?:; charset=utf-8)?$/,
  );
  assert.equal(backup.headers['cache-control'], 'private, no-store');
  assert.match(
    String(backup.headers['content-disposition']),
    /^attachment; filename="stockapp-backup-\d{4}-\d{2}-\d{2}-\d{6}\.json"$/,
  );
  assert.ok(backup.headers['x-request-id']);
  createSchemaValidator(contractSchemas.BackupV1)(backup.json());
  parseBackupV1(backup.body);
  assert.equal(backup.body, `${JSON.stringify(backup.json(), null, 2)}\n`);
  const exportResponse = await f.app.inject({
    url: '/v1/me/export',
    headers: { cookie: a.cookie },
  });
  assert.equal(exportResponse.statusCode, 200);
  createSchemaValidator(contractSchemas.AccountExport)(exportResponse.json());
  assert.deepEqual(exportResponse.json().backup, backup.json());
  assert.equal(exportResponse.json().user.id, a.authenticated.user.id);
  for (const path of [
    `/v1/inventories/${b.context.inventory.id}/backup`,
    `/v1/inventories/${id()}/backup`,
  ]) {
    const response = await f.app.inject({
      url: path,
      headers: { cookie: a.cookie },
    });
    assert.equal(response.statusCode, 404);
    createSchemaValidator(contractSchemas.ApiError)(response.json());
  }
  const foreign = await f.app.inject({
    url: '/v1/me/export',
    headers: { cookie: b.cookie },
  });
  const parsed = parseBackupV1(JSON.stringify(foreign.json().backup));
  for (const rows of Object.values(parsed.data))
    for (const row of rows)
      assert.equal(
        exportResponse.body.includes('id' in row ? row.id : row.productId),
        false,
      );
  assert.deepEqual((await counts()).rows, before);
  for (const suffix of ['?unexpected=true', '?recentlyAuthenticated=true'])
    assert.equal(
      (
        await f.app.inject({
          url: path + suffix,
          headers: { cookie: a.cookie },
        })
      ).statusCode,
      400,
    );
  assert.equal(
    (
      await f.app.inject({
        url: path,
        headers: { cookie: a.cookie, origin: 'https://hostile.example.test' },
      })
    ).statusCode,
    403,
  );
  const logs = f.logs.join('\n');
  for (const canary of [
    a.email,
    b.email,
    a.cookie,
    'BACKUP_PRODUCT_HTTP_A_PRIVATE_Q7X9',
    'BACKUP_PRODUCT_HTTP_B_PRIVATE_Q7X9',
    'BACKUP_SALE_HTTP_A_PRIVATE_Q7X9',
    'BACKUP_PURCHASE_HTTP_B_PRIVATE_Q7X9',
    'stockapp-backup',
  ])
    assert.equal(logs.includes(canary), false);
});

test('current authorization revalidation catches DELETING and revocation committed after the financial snapshot, with no partial response', async (t) => {
  let change: (() => Promise<void>) | undefined;
  const f = await backupFixture(t, async (snapshot) => {
    await change?.();
    return snapshot;
  });
  const a = await f.owner('revalidate');
  change = async () => {
    await f.pool.query("UPDATE businesses SET status='DELETING' WHERE id=$1", [
      a.context.business.id,
    ]);
  };
  let response = await f.app.inject({
    url: '/v1/me/export',
    headers: { cookie: a.cookie },
  });
  assert.equal(response.statusCode, 403);
  assert.equal(response.json().error.code, 'CLOUD_ACCESS_DISABLED');
  await f.pool.query("UPDATE businesses SET status='ACTIVE' WHERE id=$1", [
    a.context.business.id,
  ]);
  change = async () => {
    await f.post('sign-out', {}, a.cookie);
  };
  response = await f.app.inject({
    url: `/v1/inventories/${a.context.inventory.id}/backup`,
    headers: { cookie: a.cookie },
  });
  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error.code, 'UNAUTHENTICATED');
  assert.doesNotMatch(response.body, /stockapp-backup|BACKUP_INVENTORY/);
});

test('corrupt snapshot fails with sanitized ApiError and shared read bucket remains durable and limited to 120/60', async (t) => {
  let corrupt = false;
  const f = await backupFixture(t, async (snapshot) =>
    corrupt ? { ...snapshot, inventoryStates: [] } : snapshot,
  );
  const a = await f.owner('security');
  await f.history(a.context, 'SECURITY');
  const get = (path = '/v1/me/export') =>
    f.app.inject({ url: path, headers: { cookie: a.cookie } });
  corrupt = true;
  const failed = await get();
  assert.equal(failed.statusCode, 500);
  createSchemaValidator(contractSchemas.ApiError)(failed.json());
  assert.equal(failed.json().error.code, 'INTERNAL_ERROR');
  assert.equal(failed.headers['cache-control'], 'no-store');
  assert.doesNotMatch(failed.body, /snapshot|State|SQL|BACKUP_/);
  corrupt = false;
  f.advanceRate();
  const before = await f.pool.query(
    'SELECT count(*) FROM security_rate_limits',
  );
  assert.ok(Number(before.rows[0].count) > 0);
  for (let attempt = 0; attempt < 120; attempt++)
    assert.equal(
      (
        await get(
          attempt % 2
            ? `/v1/inventories/${a.context.inventory.id}/backup`
            : '/v1/me/export',
        )
      ).statusCode,
      200,
    );
  const limited = await get();
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.json().error.code, 'RATE_LIMITED');
  assert.ok(Number(limited.headers['retry-after']) > 0);
  f.advanceRate();
  assert.equal((await get()).statusCode, 200);
});
