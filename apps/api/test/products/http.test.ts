import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSchemaValidator, contractSchemas } from '@stock-app/contracts';
import { authFixture } from '../auth/helpers.js';
import { createDatabase } from '../../src/infrastructure/postgres/client.js';
import { registerOwnershipRoutes } from '../../src/ownership/routes.js';
import { registerProductRoutes } from '../../src/products/routes.js';
import { resolveAuthenticatedUser } from '../../src/ownership/context.js';
import { bootstrapEmptyInventory } from '../../src/ownership/bootstrap.js';
import { createCommand, updateCommand, archiveCommand } from './helpers.js';
import { id } from '../postgres/helpers.js';

const PRIVATE_BARCODE_LOG_CANARY = 'PRODUCT_BARCODE_PRIVATE_CANARY_Q7X9K2';

function assertPrivateBarcodeAbsent(logs: string) {
  assert.ok(!logs.includes(PRIVATE_BARCODE_LOG_CANARY));
}

test('barcode log canary detects leaks without colliding with numeric telemetry', () => {
  assertPrivateBarcodeAbsent('{"responseTime":22.138200000001234}');
  assert.throws(
    () =>
      assertPrivateBarcodeAbsent(
        JSON.stringify({ barcode: PRIVATE_BARCODE_LOG_CANARY }),
      ),
    assert.AssertionError,
  );
});

test('Product HTTP commands retain shared security, transport boundary, ownership, durable receipts and sanitized responses', async (t) => {
  let now = Date.now();
  const f = await authFixture(t, {}, () => now),
    db = createDatabase(f.pool);
  registerOwnershipRoutes(f.app, f.runtime.auth, db);
  registerProductRoutes(f.app, f.runtime.auth, db, () => 2000);
  async function owner(letter: string) {
    now += 3600001;
    const email = `product-${letter}@example.test`;
    await f.signup(email);
    await f.verify(email);
    const { cookie } = await f.signin(email);
    const authenticated = await resolveAuthenticatedUser(f.runtime.auth, {
      cookie,
    });
    const dataset = await bootstrapEmptyInventory(db, authenticated.user.id, {
      inventoryName: 'Fictional',
      currency: 'USD',
      reportingTimeZone: 'UTC',
    });
    await f.pool.query(
      'UPDATE businesses SET cloud_access_enabled=true WHERE id=$1',
      [dataset.business.id],
    );
    const csrf = await f.app.inject({
      url: '/v1/session/csrf',
      headers: { cookie },
    });
    return {
      cookie,
      csrf: String(csrf.json().token),
      inventoryId: dataset.inventory.id,
      businessId: dataset.business.id,
    };
  }
  const a = await owner('a'),
    b = await owner('b');
  const base = (scope = a) => `/v1/inventories/${scope.inventoryId}/products`;
  const create = createCommand({ barcode: PRIVATE_BARCODE_LOG_CANARY });
  const mutations = [
    { method: 'POST' as const, url: base(), command: create },
    {
      method: 'PATCH' as const,
      url: `${base()}/${create.payload.productId}`,
      command: updateCommand(create.payload.productId),
    },
    {
      method: 'POST' as const,
      url: `${base()}/${create.payload.productId}/archive`,
      command: archiveCommand(create.payload.productId),
    },
  ];
  const headers = (command: { operationId: string } = create, scope = a) => ({
    cookie: scope.cookie,
    origin: f.config.appOrigin,
    'x-csrf-token': scope.csrf,
    'content-type': 'application/json',
    'idempotency-key': command.operationId,
  });
  async function send(
    method: 'POST' | 'PATCH',
    url: string,
    payload: unknown,
    supplied: Record<string, string>,
  ) {
    const response = await f.app.inject({
      method,
      url,
      payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
      headers: supplied,
    });
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.ok(response.headers['x-request-id']);
    if (response.statusCode >= 400) {
      createSchemaValidator(contractSchemas.ApiError)(response.json());
      assert.equal(
        response.json().error.requestId,
        response.headers['x-request-id'],
      );
      assert.doesNotMatch(
        response.body,
        /constraint|SELECT|INSERT|stack|fictional failure/i,
      );
    }
    return response;
  }
  for (const route of mutations) {
    const cases = [
      { label: 'anonymous', status: 401, change: { cookie: '' } },
      { label: 'missing csrf', status: 403, change: { 'x-csrf-token': '' } },
      {
        label: 'wrong csrf',
        status: 403,
        change: { 'x-csrf-token': 'a'.repeat(43) },
      },
      {
        label: 'foreign origin',
        status: 403,
        change: { origin: 'https://evil.example.test' },
      },
      { label: 'null origin', status: 403, change: { origin: 'null' } },
      {
        label: 'not JSON',
        status: 415,
        change: { 'content-type': 'text/plain' },
      },
      {
        label: 'missing idempotency',
        status: 400,
        change: { 'idempotency-key': '' },
      },
      {
        label: 'mismatched idempotency',
        status: 400,
        change: { 'idempotency-key': id() },
      },
    ];
    for (const entry of cases)
      await t.test(
        `${route.command.commandKind}: ${entry.label} rejects before executor`,
        async () => {
          now += 60001;
          const before = (
            await f.pool.query('SELECT count(*) FROM operation_receipts')
          ).rows;
          const response = await send(route.method, route.url, route.command, {
            ...headers(route.command),
            ...entry.change,
          });
          assert.equal(response.statusCode, entry.status);
          assert.deepEqual(
            (await f.pool.query('SELECT count(*) FROM operation_receipts'))
              .rows,
            before,
          );
        },
      );
  }
  await t.test(
    'disabled/DELETING/unverified account is denied without writes',
    async () => {
      for (const change of [
        'cloud_access_enabled=false',
        "cloud_access_enabled=true,status='DELETING'",
      ]) {
        await f.pool.query(`UPDATE businesses SET ${change} WHERE id=$1`, [
          a.businessId,
        ]);
        assert.equal(
          (await send('POST', base(), create, headers())).statusCode,
          403,
        );
      }
      await f.pool.query(
        "UPDATE businesses SET status='ACTIVE',cloud_access_enabled=true WHERE id=$1",
        [a.businessId],
      );
      await f.pool.query(
        'UPDATE "user" SET email_verified=false WHERE id=(SELECT owner_user_id FROM businesses WHERE id=$1)',
        [a.businessId],
      );
      assert.equal(
        (await send('POST', base(), create, headers())).statusCode,
        403,
      );
      await f.pool.query(
        'UPDATE "user" SET email_verified=true WHERE id=(SELECT owner_user_id FROM businesses WHERE id=$1)',
        [a.businessId],
      );
    },
  );
  for (const [name, body] of [
    [
      'positive unknown cost',
      createCommand({
        initialStock: 1,
        initialMovementId: id(),
        initialUnitCost: null,
      }),
    ],
    ['negative stock', createCommand({ initialStock: -1 })],
    ['fractional stock', createCommand({ initialStock: 0.5 })],
    [
      'new v4 product',
      createCommand({ productId: '550e8400-e29b-41d4-a716-446655440000' }),
    ],
    ['wrong command kind', archiveCommand(create.payload.productId)],
    ['extra ownership', { ...create, ownerUserId: 'spoofed' }],
    ['malformed JSON', '{'],
    [
      'oversized body',
      JSON.stringify({ ...create, padding: 'x'.repeat(33000) }),
    ],
  ] as const)
    await t.test(`creation transport ${name}: no receipt`, async () => {
      now += 60001;
      const response = await send('POST', base(), body, headers());
      assert.equal(response.statusCode, name === 'oversized body' ? 413 : 400);
      assert.equal(
        (await f.pool.query('SELECT count(*) FROM operation_receipts')).rows[0]
          .count,
        '0',
      );
    });
  await t.test(
    'successful create has frozen 200 result; header/UUID case and semantic replay are preserved',
    async () => {
      now += 60001;
      const first = await send('POST', base(), create, {
        ...headers(),
        'idempotency-key': create.operationId.toUpperCase(),
      });
      assert.equal(first.statusCode, 200);
      createSchemaValidator(contractSchemas.CreateProductResult)(first.json());
      assert.equal(first.json().product.barcode, PRIVATE_BARCODE_LOG_CANARY);
      const replay = await send('POST', base(), create, headers());
      assert.deepEqual(replay.json(), first.json());
      const mismatch = await send(
        'POST',
        base(),
        { ...create, payload: { ...create.payload, name: 'Changed' } },
        headers(),
      );
      assert.equal(mismatch.statusCode, 409);
      assert.equal(mismatch.json().error.code, 'IDEMPOTENCY_KEY_REUSED');
    },
  );
  await t.test(
    'path/payload mismatch and extra stock fields in PATCH fail before writes',
    async () => {
      const update = updateCommand(create.payload.productId);
      for (const [url, body] of [
        [`${base()}/${id()}`, update],
        [
          `${base()}/${create.payload.productId}`,
          { ...update, payload: { ...update.payload, stock: 100 } },
        ],
      ] as const)
        assert.equal(
          (await send('PATCH', url, body, headers(update))).statusCode,
          400,
        );
      assert.equal(
        (
          await f.pool.query('SELECT revision FROM inventories WHERE id=$1', [
            a.inventoryId,
          ])
        ).rows[0].revision,
        '1',
      );
    },
  );
  await t.test(
    'A/B Product child ID isolation returns 404 with no foreign fields or mutation',
    async () => {
      const foreign = createCommand({
        name: 'FOREIGN_NAME_CANARY',
        barcode: 'FOREIGN_BARCODE_CANARY',
      });
      assert.equal(
        (await send('POST', base(b), foreign, headers(foreign, b))).statusCode,
        200,
      );
      for (const [method, suffix, command] of [
        ['PATCH', '', updateCommand(foreign.payload.productId)],
        ['POST', '/archive', archiveCommand(foreign.payload.productId)],
      ] as const) {
        const response = await send(
          method,
          `${base()}/${foreign.payload.productId}${suffix}`,
          command,
          headers(command),
        );
        assert.equal(response.statusCode, 404);
        assert.doesNotMatch(
          response.body,
          /FOREIGN_NAME|FOREIGN_BARCODE|metadataRevision|isArchived/,
        );
        assert.equal(
          (
            await send(
              method,
              `${base(b)}/${foreign.payload.productId}${suffix}`,
              command,
              headers(command),
            )
          ).statusCode,
          404,
        );
      }
      assert.equal(
        (
          await f.pool.query(
            'SELECT metadata_revision FROM products WHERE id=$1',
            [foreign.payload.productId],
          )
        ).rows[0].metadata_revision,
        '0',
      );
    },
  );
  await t.test(
    'PATCH increments metadata; stale terminal conflict and archive results/receipts use frozen shapes',
    async () => {
      const update = updateCommand(create.payload.productId, '0', {
        barcode: PRIVATE_BARCODE_LOG_CANARY,
      });
      const updated = await send(
        'PATCH',
        `${base()}/${create.payload.productId.toUpperCase()}`,
        update,
        headers(update),
      );
      assert.equal(updated.statusCode, 200);
      createSchemaValidator(contractSchemas.ProductMutationResult)(
        updated.json(),
      );
      assert.equal(updated.json().product.metadataRevision, '1');
      const stale = updateCommand(create.payload.productId),
        conflict = await send(
          'PATCH',
          `${base()}/${create.payload.productId}`,
          stale,
          headers(stale),
        );
      assert.equal(conflict.statusCode, 409);
      assert.deepEqual(conflict.json().error.details, { currentRevision: '1' });
      const retry = await send(
        'PATCH',
        `${base()}/${create.payload.productId}`,
        stale,
        headers(stale),
      );
      assert.equal(retry.json().error.code, 'REVISION_CONFLICT');
      assert.notEqual(
        retry.json().error.requestId,
        conflict.json().error.requestId,
      );
      const archive = archiveCommand(create.payload.productId, '1'),
        archived = await send(
          'POST',
          `${base()}/${create.payload.productId}/archive`,
          archive,
          headers(archive),
        );
      assert.equal(archived.statusCode, 200);
      assert.equal(archived.json().product.isArchived, true);
      assert.deepEqual(
        (
          await send(
            'POST',
            `${base()}/${create.payload.productId}/archive`,
            archive,
            headers(archive),
          )
        ).json(),
        archived.json(),
      );
      for (const command of [create, update, archive]) {
        const receipt = await f.app.inject({
          url: `/v1/inventories/${a.inventoryId}/operations/${command.operationId}`,
          headers: { cookie: a.cookie },
        });
        assert.equal(receipt.statusCode, 200);
        createSchemaValidator(contractSchemas.OperationReceipt)(receipt.json());
        assert.equal(receipt.json().changeSet.upserts.products.length, 1);
        assert.equal(
          receipt.json().changeSet.upserts.inventoryStates.length,
          command === create ? 1 : 0,
        );
      }
    },
  );
  await t.test(
    'structurally valid but incomplete accepted ChangeSet fails closed on commercial replay',
    async () => {
      const data = await f.pool.query(
        'SELECT changes FROM inventory_change_sets WHERE inventory_id=$1 AND revision=1',
        [a.inventoryId],
      );
      const original = data.rows[0].changes;
      await f.pool.query(
        'UPDATE inventory_change_sets SET changes=$1 WHERE inventory_id=$2 AND revision=1',
        [
          {
            ...original,
            upserts: { ...original.upserts, inventoryStates: [] },
          },
          a.inventoryId,
        ],
      );
      assert.equal(
        (await send('POST', base(), create, headers())).statusCode,
        500,
      );
      await f.pool.query(
        'UPDATE inventory_change_sets SET changes=$1 WHERE inventory_id=$2 AND revision=1',
        [original, a.inventoryId],
      );
    },
  );
  await t.test(
    'durable command rate bucket applies to all Product routes',
    async () => {
      now += 60001;
      for (let i = 0; i < 60; i++)
        assert.equal(
          (await send('POST', base(), create, headers())).statusCode,
          200,
        );
      const limited = await send(
        'PATCH',
        `${base()}/${create.payload.productId}`,
        updateCommand(create.payload.productId, '2'),
        headers(),
      );
      assert.equal(limited.statusCode, 429);
      assert.ok(limited.headers['retry-after']);
      const rows = await f.pool.query(
        "SELECT count(*) FROM security_rate_limits WHERE scope='business-command-user' AND count=61",
      );
      assert.equal(rows.rows[0].count, '1');
    },
  );
  const logs = f.logs.join('');
  assertPrivateBarcodeAbsent(logs);
  assert.match(logs, /"responseTime":\d/);
  assert.doesNotMatch(
    logs,
    /FOREIGN_NAME_CANARY|FOREIGN_BARCODE_CANARY|Fictional Product|Updated Product/,
  );
});
