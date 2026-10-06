import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validate, version } from 'uuid';
import { authFixture } from '../auth/helpers.js';
import { id, insertFixtureUser } from '../postgres/helpers.js';
import { createDatabase } from '../../src/infrastructure/postgres/client.js';
import { registerOwnershipRoutes } from '../../src/ownership/routes.js';
import { bootstrapEmptyInventory } from '../../src/ownership/bootstrap.js';
import { setPilotAccess, PilotAccessError } from '../../src/ownership/pilot.js';

const input = {
  inventoryName: 'Fictional Inventory',
  currency: 'USD',
  reportingTimeZone: 'America/Guayaquil',
};
type Dataset = {
  business: { id: string; status: string; cloudAccessEnabled: boolean };
  inventory: {
    id: string;
    name: string;
    currency: string;
    reportingTimeZone: string;
  };
};

test('ownership HTTP with real PostgreSQL and Better Auth enforces scope and empty bootstrap', async (t) => {
  const f = await authFixture(t);
  const db = createDatabase(f.pool);
  registerOwnershipRoutes(f.app, f.runtime.auth, db, () => 1234567890);
  const request = async (
    method: 'GET' | 'POST',
    url: string,
    cookie?: string,
    body?: unknown,
  ) => {
    const csrf =
      method === 'POST' && cookie
        ? (
            await f.app.inject({ url: '/v1/session/csrf', headers: { cookie } })
          ).json().token
        : undefined;
    const response = await f.app.inject({
      method,
      url,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(csrf ? { 'x-csrf-token': csrf } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { payload: JSON.stringify(body) } : {}),
    });
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.ok(response.headers['x-request-id']);
    if (response.statusCode >= 400)
      assert.equal(
        response.json().error.requestId,
        response.headers['x-request-id'],
      );
    return response;
  };
  async function code(
    method: 'GET' | 'POST',
    url: string,
    status: number,
    expected: string,
    cookie?: string,
    body?: unknown,
  ) {
    const response = await request(method, url, cookie, body);
    assert.equal(response.statusCode, status, response.body);
    assert.equal(response.json().error.code, expected);
    return response;
  }
  async function zeroData() {
    for (const table of [
      'businesses',
      'inventories',
      'products',
      'sales',
      'purchases',
    ])
      assert.equal((await f.pool.query(`SELECT id FROM ${table}`)).rowCount, 0);
  }
  await t.test(
    'anonymous cannot bootstrap or query metadata; spoofed IDs/tokens do not authenticate',
    async () => {
      await code('GET', '/v1/me', 401, 'UNAUTHENTICATED');
      await code(
        'POST',
        '/v1/business',
        401,
        'UNAUTHENTICATED',
        undefined,
        input,
      );
      await code(
        'GET',
        `/v1/inventories/${id()}`,
        401,
        'UNAUTHENTICATED',
        'better-auth.session_token=fake',
      );
      await code('GET', '/v1/me?userId=other', 400, 'VALIDATION_ERROR');
    },
  );
  await f.signup('owner-a@example.test');
  await f.verify('owner-a@example.test');
  const { cookie: cookieA, result: loginA } = await f.signin(
    'owner-a@example.test',
  );
  const userA: string = loginA.json().user.id;
  await t.test(
    'signup plus verification/login creates no Business/Inventory/products/sales/purchases',
    zeroData,
  );
  await t.test(
    'verified identity-only me is minimal and has no dataset or credential',
    async () => {
      const response = await request('GET', '/v1/me', cookieA);
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json(), {
        user: { id: userA, email: 'owner-a@example.test', emailVerified: true },
        business: null,
        inventory: null,
        capabilities: { protocolVersions: [1], domainVersions: [1] },
      });
      await code('GET', `/v1/inventories/${id()}`, 404, 'NOT_FOUND', cookieA);
      await zeroData();
    },
  );
  await t.test(
    'all server fields, unknown query, malformed currency/timezone/name rejected without writes',
    async () => {
      for (const field of [
        'userId',
        'ownerUserId',
        'businessId',
        'inventoryId',
        'status',
        'cloudAccessEnabled',
        'generation',
        'revision',
        'createdAt',
        'updatedAt',
        'import',
      ])
        await code('POST', '/v1/business', 400, 'VALIDATION_ERROR', cookieA, {
          ...input,
          [field]: field === 'cloudAccessEnabled' ? true : 'hostile',
        });
      for (const overrides of [
        { inventoryName: '  ' },
        { inventoryName: '' },
        { inventoryName: 'x'.repeat(201) },
        { inventoryName: 3 },
        { currency: 'usd' },
        { currency: 'USD\n' },
        { currency: 'US' },
        { reportingTimeZone: '' },
        { reportingTimeZone: 'bad-zone' },
        { reportingTimeZone: '+01:00' },
        { reportingTimeZone: '-0500' },
        { reportingTimeZone: ' ' },
      ])
        await code('POST', '/v1/business', 400, 'VALIDATION_ERROR', cookieA, {
          ...input,
          ...overrides,
        });
      await code(
        'POST',
        '/v1/business?ownerUserId=other',
        400,
        'VALIDATION_ERROR',
        cookieA,
        input,
      );
      const text = await f.app.inject({
        method: 'POST',
        url: '/v1/business',
        headers: { cookie: cookieA, 'content-type': 'text/plain' },
        payload: JSON.stringify(input),
      });
      assert.equal(text.statusCode, 415);
      await zeroData();
    },
  );
  await t.test(
    'valid but inconsistent unverified session rejects all ownership routes explicitly',
    async () => {
      await f.pool.query('UPDATE "user" SET email_verified=false WHERE id=$1', [
        userA,
      ]);
      await code('GET', '/v1/me', 403, 'EMAIL_NOT_VERIFIED', cookieA);
      await code(
        'POST',
        '/v1/business',
        403,
        'EMAIL_NOT_VERIFIED',
        cookieA,
        input,
      );
      await code(
        'GET',
        `/v1/inventories/${id()}`,
        403,
        'EMAIL_NOT_VERIFIED',
        cookieA,
      );
      await f.pool.query('UPDATE "user" SET email_verified=true WHERE id=$1', [
        userA,
      ]);
    },
  );
  let a: Dataset;
  await t.test(
    'bootstrap creates one disabled ACTIVE Business + one empty UUIDv7 Inventory atomically',
    async () => {
      const response = await request('POST', '/v1/business', cookieA, {
        ...input,
        inventoryName: `  ${input.inventoryName}  `,
      });
      assert.equal(response.statusCode, 201, response.body);
      a = response.json<Dataset>();
      assert.equal(a.business.status, 'ACTIVE');
      assert.equal(a.business.cloudAccessEnabled, false);
      assert.equal(a.inventory.name, input.inventoryName);
      for (const resourceId of [a.business.id, a.inventory.id]) {
        assert.equal(validate(resourceId), true);
        assert.equal(version(resourceId), 7);
      }
      const business = await f.pool.query(
        'SELECT owner_user_id FROM businesses WHERE id=$1',
        [a.business.id],
      );
      assert.equal(business.rows[0].owner_user_id, userA);
      const inventory = await f.pool.query(
        'SELECT created_at,updated_at,revision,generation FROM inventories WHERE id=$1',
        [a.inventory.id],
      );
      assert.equal(inventory.rows[0].created_at, '1234567890');
      assert.equal(inventory.rows[0].updated_at, '1234567890');
      assert.equal(inventory.rows[0].revision, '0');
      assert.equal(version(inventory.rows[0].generation), 4);
      for (const table of ['products', 'sales', 'purchases'])
        assert.equal(
          (await f.pool.query(`SELECT id FROM ${table}`)).rowCount,
          0,
        );
    },
  );
  await t.test(
    'same bootstrap returns existing resource, changed input conflicts; disabled me still works',
    async () => {
      const repeated = await request('POST', '/v1/business', cookieA, input);
      assert.equal(repeated.statusCode, 200);
      assert.deepEqual(repeated.json(), a);
      for (const change of [
        { inventoryName: 'Different' },
        { currency: 'EUR' },
        { reportingTimeZone: 'UTC' },
      ])
        await code(
          'POST',
          '/v1/business',
          409,
          'BUSINESS_ALREADY_EXISTS',
          cookieA,
          { ...input, ...change },
        );
      const me = await request('GET', '/v1/me', cookieA);
      assert.deepEqual(me.json().business, a.business);
      assert.deepEqual(me.json().inventory, a.inventory);
      await code(
        'GET',
        `/v1/inventories/${a.inventory.id}`,
        403,
        'CLOUD_ACCESS_DISABLED',
        cookieA,
      );
      assert.equal(
        (await f.pool.query('SELECT id FROM businesses')).rowCount,
        1,
      );
      assert.equal(
        (await f.pool.query('SELECT id FROM inventories')).rowCount,
        1,
      );
    },
  );
  await f.signup('owner-b@example.test');
  await f.verify('owner-b@example.test');
  const { cookie: cookieB, result: loginB } = await f.signin(
    'owner-b@example.test',
  );
  const userB: string = loginB.json().user.id;
  let b: Dataset;
  await t.test(
    'concurrent same-owner HTTP bootstrap leaves exactly one dataset',
    async () => {
      const responses = await Promise.all([
        request('POST', '/v1/business', cookieB, input),
        request('POST', '/v1/business', cookieB, input),
      ]);
      assert.deepEqual(responses.map((r) => r.statusCode).sort(), [200, 201]);
      assert.deepEqual(responses[0].json(), responses[1].json());
      b = responses[0].json<Dataset>();
      assert.equal(
        (
          await f.pool.query(
            'SELECT id FROM businesses WHERE owner_user_id=$1',
            [userB],
          )
        ).rowCount,
        1,
      );
      assert.equal(
        (
          await f.pool.query(
            'SELECT id FROM inventories WHERE business_id=$1',
            [b.business.id],
          )
        ).rowCount,
        1,
      );
    },
  );
  await setPilotAccess(db, userA, true);
  await setPilotAccess(db, userB, true);
  await t.test(
    'A/B own metadata succeeds; foreign and absent IDs have identical 404 without leak',
    async () => {
      for (const [cookie, own, foreign] of [
        [cookieA, a, b],
        [cookieB, b, a],
      ] as const) {
        const ownResponse = await request(
          'GET',
          `/v1/inventories/${own.inventory.id}`,
          cookie,
        );
        assert.equal(ownResponse.statusCode, 200);
        assert.deepEqual(ownResponse.json(), own.inventory);
        assert.equal(
          (
            await request(
              'GET',
              `/v1/inventories/${own.inventory.id.toUpperCase()}`,
              cookie,
            )
          ).statusCode,
          200,
        );
        const rejected = await code(
          'GET',
          `/v1/inventories/${foreign.inventory.id}`,
          404,
          'NOT_FOUND',
          cookie,
        );
        const missing = await code(
          'GET',
          `/v1/inventories/${id()}`,
          404,
          'NOT_FOUND',
          cookie,
        );
        assert.equal(
          rejected.json().error.message,
          missing.json().error.message,
        );
        assert.equal(rejected.body.includes(foreign.business.id), false);
        const me = await request('GET', '/v1/me', cookie);
        assert.equal(me.json().business.id, own.business.id);
        assert.equal(me.json().business.cloudAccessEnabled, true);
        assert.equal(me.body.includes(foreign.inventory.id), false);
        await code('POST', '/v1/business', 400, 'VALIDATION_ERROR', cookie, {
          ...input,
          businessId: foreign.business.id,
          ownerUserId: 'foreign',
        });
        await code(
          'GET',
          `/v1/inventories/${own.inventory.id}?userId=foreign`,
          400,
          'VALIDATION_ERROR',
          cookie,
        );
      }
    },
  );
  await t.test(
    'disable immediately denies S routes, preserves datasets and sessions; idempotent updates',
    async () => {
      const before = (
        await f.pool.query('SELECT * FROM businesses WHERE id=$1', [
          a.business.id,
        ])
      ).rows;
      await setPilotAccess(db, userA, true);
      assert.deepEqual(
        (
          await f.pool.query('SELECT * FROM businesses WHERE id=$1', [
            a.business.id,
          ])
        ).rows,
        before,
      );
      await setPilotAccess(db, userA, false);
      const disabled = (
        await f.pool.query('SELECT * FROM businesses WHERE id=$1', [
          a.business.id,
        ])
      ).rows;
      await setPilotAccess(db, userA, false);
      assert.deepEqual(
        (
          await f.pool.query('SELECT * FROM businesses WHERE id=$1', [
            a.business.id,
          ])
        ).rows,
        disabled,
      );
      await code(
        'GET',
        `/v1/inventories/${a.inventory.id}`,
        403,
        'CLOUD_ACCESS_DISABLED',
        cookieA,
      );
      assert.equal((await request('GET', '/v1/me', cookieA)).statusCode, 200);
      assert.equal((await f.session(cookieA)).json().user.id, userA);
      assert.equal(
        (await f.pool.query('SELECT id FROM inventories')).rowCount,
        2,
      );
      await setPilotAccess(db, userA, true);
    },
  );
  await t.test(
    'DELETING blocks S routes and pilot enable even if flag was previously true',
    async () => {
      await f.pool.query(
        "UPDATE businesses SET status='DELETING' WHERE id=$1",
        [a.business.id],
      );
      await code(
        'GET',
        `/v1/inventories/${a.inventory.id}`,
        403,
        'CLOUD_ACCESS_DISABLED',
        cookieA,
      );
      await assert.rejects(setPilotAccess(db, userA, true), PilotAccessError);
      await code(
        'POST',
        '/v1/business',
        409,
        'BUSINESS_ALREADY_EXISTS',
        cookieA,
        input,
      );
      await setPilotAccess(db, userA, false);
      await f.pool.query("UPDATE businesses SET status='ACTIVE' WHERE id=$1", [
        a.business.id,
      ]);
    },
  );
  await t.test(
    'admin/deletion/financial/sync/import routes absent; expired and revoked sessions rejected',
    async () => {
      for (const url of [
        '/admin',
        '/v1/admin',
        '/v1/pilot',
        '/health',
        '/v1/products',
        '/v1/sales',
        '/v1/purchases',
        '/v1/history',
        '/v1/sync',
        '/v1/imports',
        `/v1/inventories/${a.inventory.id}/products`,
      ])
        assert.equal(
          (
            await f.app.inject({
              method: 'GET',
              url,
              headers: { cookie: cookieA },
            })
          ).statusCode,
          404,
        );
      assert.equal((await f.post('delete-user', {}, cookieA)).statusCode, 404);
      await f.pool.query(
        "UPDATE session SET expires_at=now()-interval '1 second' WHERE user_id=$1",
        [userA],
      );
      await code('GET', '/v1/me', 401, 'UNAUTHENTICATED', cookieA);
      await f.post('sign-out', {}, cookieB);
      await code('GET', '/v1/me', 401, 'UNAUTHENTICATED', cookieB);
    },
  );
  await t.test(
    'SQL failure returns only sanitized 500/requestId and no-store; logs omit credentials',
    async () => {
      await f.signup('failure@example.test');
      await f.verify('failure@example.test');
      const { cookie } = await f.signin('failure@example.test');
      await f.pool.query(
        'ALTER TABLE businesses RENAME TO businesses_test_unavailable',
      );
      try {
        const response = await code(
          'GET',
          '/v1/me',
          500,
          'INTERNAL_ERROR',
          cookie,
        );
        assert.doesNotMatch(
          response.body,
          /SQL|constraint|relation|owner|stack|failure@example/,
        );
        assert.doesNotMatch(
          f.logs.join(''),
          /session_token|password|owner_user_id|example.test|relation|SELECT/,
        );
        assert.equal((await f.app.inject('/live')).statusCode, 200);
      } finally {
        await f.pool.query(
          'ALTER TABLE businesses_test_unavailable RENAME TO businesses',
        );
      }
    },
  );
});

test('pilot preconditions and bootstrap rollback are enforced by real PostgreSQL transactions', async (t) => {
  const f = await authFixture(t);
  const db = createDatabase(f.pool);
  await insertFixtureUser(f.pool, 'unverified', false);
  await insertFixtureUser(f.pool, 'missing-business');
  await insertFixtureUser(f.pool, 'missing-inventory');
  const reserved = id();
  await f.pool.query(
    'INSERT INTO businesses(id,owner_user_id) VALUES ($1,$2)',
    [reserved, 'missing-inventory'],
  );
  await t.test(
    'missing identity/Business/Inventory and unverified user never enable',
    async () => {
      for (const userId of [
        'missing-user',
        'missing-business',
        'missing-inventory',
      ])
        await assert.rejects(
          setPilotAccess(db, userId, true),
          PilotAccessError,
        );
      await bootstrapEmptyInventory(db, 'unverified', input).then(
        () => assert.fail('unverified bootstrap must reject'),
        (error) => assert.equal(error.code, 'EMAIL_NOT_VERIFIED'),
      );
      // Prepare an inconsistent unverified dataset explicitly as a fixture.
      const business = id();
      await f.pool.query(
        'INSERT INTO businesses(id,owner_user_id) VALUES ($1,$2)',
        [business, 'unverified'],
      );
      await f.pool.query(
        "INSERT INTO inventories(id,business_id,name,currency,reporting_time_zone,created_at,updated_at) VALUES ($1,$2,'Unverified','USD','UTC',1,1)",
        [id(), business],
      );
      await assert.rejects(
        setPilotAccess(db, 'unverified', true),
        PilotAccessError,
      );
      assert.equal(
        (
          await f.pool.query(
            'SELECT id FROM businesses WHERE cloud_access_enabled',
          )
        ).rowCount,
        0,
      );
      await setPilotAccess(db, 'unverified', false);
    },
  );
  await t.test(
    'reserved Business without Inventory conflicts with empty bootstrap, remains untouched',
    async () => {
      await assert.rejects(
        bootstrapEmptyInventory(db, 'missing-inventory', input),
        { code: 'BUSINESS_ALREADY_EXISTS' },
      );
      assert.equal(
        (
          await f.pool.query(
            'SELECT id FROM inventories WHERE business_id=$1',
            [reserved],
          )
        ).rowCount,
        0,
      );
    },
  );
  await t.test(
    'clock failure after Business insert rolls back both; Inventory insert DB failure also rolls back',
    async () => {
      await insertFixtureUser(f.pool, 'rollback');
      await assert.rejects(
        bootstrapEmptyInventory(db, 'rollback', input, () => {
          throw new Error('controlled fixture failure');
        }),
      );
      assert.equal(
        (
          await f.pool.query(
            'SELECT id FROM businesses WHERE owner_user_id=$1',
            ['rollback'],
          )
        ).rowCount,
        0,
      );
      await f.pool.query(
        "ALTER TABLE inventories ADD CONSTRAINT fixture_inventory_reject CHECK (name <> 'Fictional Inventory')",
      );
      try {
        await assert.rejects(bootstrapEmptyInventory(db, 'rollback', input));
      } finally {
        await f.pool.query(
          'ALTER TABLE inventories DROP CONSTRAINT fixture_inventory_reject',
        );
      }
      assert.equal(
        (
          await f.pool.query(
            'SELECT id FROM businesses WHERE owner_user_id=$1',
            ['rollback'],
          )
        ).rowCount,
        0,
      );
      assert.equal(
        (
          await f.pool.query('SELECT id FROM inventories WHERE name=$1', [
            input.inventoryName,
          ])
        ).rowCount,
        0,
      );
    },
  );
  await t.test(
    'different concurrent bootstrap payloads conflict, one owner and one dataset remain',
    async () => {
      await insertFixtureUser(f.pool, 'concurrent-different');
      const results = await Promise.allSettled([
        bootstrapEmptyInventory(db, 'concurrent-different', input),
        bootstrapEmptyInventory(db, 'concurrent-different', {
          ...input,
          currency: 'EUR',
        }),
      ]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      const rejected = results.find((r) => r.status === 'rejected');
      assert.ok(rejected?.status === 'rejected');
      assert.equal(rejected.reason.code, 'BUSINESS_ALREADY_EXISTS');
      assert.equal(
        (
          await f.pool.query(
            'SELECT id FROM businesses WHERE owner_user_id=$1',
            ['concurrent-different'],
          )
        ).rowCount,
        1,
      );
      assert.equal(
        (
          await f.pool.query(
            'SELECT i.id FROM inventories i JOIN businesses b ON i.business_id=b.id WHERE b.owner_user_id=$1',
            ['concurrent-different'],
          )
        ).rowCount,
        1,
      );
    },
  );
});
