import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSchemaValidator, contractSchemas } from '@stock-app/contracts';
import { authFixture } from '../auth/helpers.js';
import { createDatabase } from '../../src/infrastructure/postgres/client.js';
import { registerOwnershipRoutes } from '../../src/ownership/routes.js';
import { registerProductRoutes } from '../../src/products/routes.js';
import { registerSaleRoutes } from '../../src/sales/routes.js';
import { resolveAuthenticatedUser } from '../../src/ownership/context.js';
import { bootstrapEmptyInventory } from '../../src/ownership/bootstrap.js';
import { createCommand } from '../products/helpers.js';
import { saleCommand } from './helpers.js';
import { id } from '../postgres/helpers.js';

test('Sale HTTP security, strict transport, A/B scoping, frozen result and durable replay', async (t) => {
  let now = Date.now();
  const f = await authFixture(t, {}, () => now),
    db = createDatabase(f.pool);
  registerOwnershipRoutes(f.app, f.runtime.auth, db);
  registerProductRoutes(f.app, f.runtime.auth, db);
  registerSaleRoutes(f.app, f.runtime.auth, db, () => 2000);
  async function owner(letter: string) {
    now += 3600001;
    const email = `sale-${letter}@example.test`;
    await f.signup(email);
    await f.verify(email);
    const { cookie } = await f.signin(email),
      auth = await resolveAuthenticatedUser(f.runtime.auth, { cookie });
    const dataset = await bootstrapEmptyInventory(db, auth.user.id, {
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
  const path = (scope = a) => `/v1/inventories/${scope.inventoryId}/sales`;
  const headers = (command: { operationId: string }, scope = a) => ({
    cookie: scope.cookie,
    origin: f.config.appOrigin,
    'x-csrf-token': scope.csrf,
    'content-type': 'application/json',
    'idempotency-key': command.operationId,
  });
  const product = createCommand({
    initialStock: 10,
    initialUnitCost: '5000000',
    initialMovementId: id(),
    name: 'SALE_PRIVATE_CANARY',
  });
  assert.equal(
    (
      await f.app.inject({
        method: 'POST',
        url: `/v1/inventories/${a.inventoryId}/products`,
        payload: product,
        headers: headers(product),
      })
    ).statusCode,
    200,
  );
  const command = saleCommand([
    {
      productId: product.payload.productId,
      quantity: 2,
      price: '7000000',
      cost: '5000000',
      estimatedCost: '10000000',
      estimatedProfit: '4000000',
    },
  ]);
  async function post(
    body: unknown = command,
    extra: Record<string, string> = {},
    url = path(),
  ) {
    const response = await f.app.inject({
      method: 'POST',
      url,
      payload: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { ...headers(command), ...extra },
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
        /SALE_PRIVATE|5000000|constraint|SELECT|stack/,
      );
    }
    return response;
  }
  for (const [label, status, extra] of [
    ['anonymous', 401, { cookie: '' }],
    ['missing csrf', 403, { 'x-csrf-token': '' }],
    ['wrong csrf', 403, { 'x-csrf-token': 'a'.repeat(43) }],
    ['foreign origin', 403, { origin: 'https://evil.example.test' }],
    ['null origin', 403, { origin: 'null' }],
    ['not JSON', 415, { 'content-type': 'text/plain' }],
    ['missing key', 400, { 'idempotency-key': '' }],
    ['wrong key', 400, { 'idempotency-key': id() }],
  ] as const)
    await t.test(label, async () => {
      now += 60001;
      assert.equal((await post(command, extra)).statusCode, status);
      assert.equal(
        (await f.pool.query('SELECT count(*) FROM sales')).rows[0].count,
        '0',
      );
      assert.equal(
        (
          await f.pool.query(
            "SELECT count(*) FROM operation_receipts WHERE kind='SALE_REGISTER'",
          )
        ).rows[0].count,
        '0',
      );
    });
  await t.test(
    'CORS preflight remains exact and does not authorize a command',
    async () => {
      const response = await f.app.inject({
        method: 'OPTIONS',
        url: path(),
        headers: {
          origin: f.config.appOrigin,
          'access-control-request-method': 'POST',
          'access-control-request-headers':
            'content-type,x-csrf-token,idempotency-key',
        },
      });
      assert.equal(response.statusCode, 204);
      assert.equal(
        response.headers['access-control-allow-origin'],
        f.config.appOrigin,
      );
      assert.equal(
        response.headers['access-control-allow-credentials'],
        'true',
      );
    },
  );
  const invalids: [string, unknown, number][] = [
    ['wrong kind', product, 400],
    [
      'missing evidence',
      { ...command, preconditions: { expectedCosts: [] } },
      400,
    ],
    [
      'duplicate Product',
      {
        ...command,
        payload: {
          ...command.payload,
          items: [
            command.payload.items[0],
            { ...command.payload.items[0], saleItemId: id(), movementId: id() },
          ],
        },
      },
      400,
    ],
    [
      'duplicate new identities',
      {
        ...command,
        payload: { ...command.payload, saleId: command.operationId },
      },
      400,
    ],
    ['client inventory', { ...command, inventoryId: b.inventoryId }, 400],
    [
      'extra total',
      { ...command, payload: { ...command.payload, totalAmount: '1' } },
      400,
    ],
    ['invalid JSON', '{', 400],
    [
      'large body',
      JSON.stringify({ ...command, padding: 'x'.repeat(1024 * 1024) }),
      413,
    ],
    [
      'unsafe Money',
      {
        ...command,
        payload: {
          ...command.payload,
          items: [
            { ...command.payload.items[0], unitSalePrice: '9007199254740992' },
          ],
        },
      },
      400,
    ],
  ];
  for (const field of ['saleId', 'saleItemId', 'movementId', 'operationId']) {
    const legacy = '550e8400-e29b-41d4-a716-446655440000';
    invalids.push([
      `new ${field} v4`,
      field === 'operationId'
        ? { ...command, operationId: legacy }
        : field === 'saleId'
          ? { ...command, payload: { ...command.payload, saleId: legacy } }
          : {
              ...command,
              payload: {
                ...command.payload,
                items: [{ ...command.payload.items[0], [field]: legacy }],
              },
            },
      400,
    ]);
  }
  for (const [label, body, status] of invalids)
    await t.test(label, async () => {
      now += 60001;
      assert.equal((await post(body)).statusCode, status);
      assert.equal(
        (
          await f.pool.query(
            "SELECT count(*) FROM operation_receipts WHERE kind='SALE_REGISTER'",
          )
        ).rows[0].count,
        '0',
      );
    });
  await t.test(
    'disabled cloud and DELETING reject before business writes',
    async () => {
      for (const change of [
        'cloud_access_enabled=false',
        "cloud_access_enabled=true,status='DELETING'",
      ]) {
        await f.pool.query(`UPDATE businesses SET ${change} WHERE id=$1`, [
          a.businessId,
        ]);
        assert.equal((await post()).statusCode, 403);
      }
      await f.pool.query(
        "UPDATE businesses SET cloud_access_enabled=true,status='ACTIVE' WHERE id=$1",
        [a.businessId],
      );
    },
  );
  await t.test(
    'two identical concurrent HTTP requests return one complete 200 Sale and one stock delta',
    async () => {
      now += 60001;
      const [first, second] = await Promise.all([
        post(),
        post(command, { 'idempotency-key': command.operationId.toUpperCase() }),
      ]);
      assert.equal(first.statusCode, 200);
      assert.deepEqual(second.json(), first.json());
      createSchemaValidator(contractSchemas.RegisterSaleResult)(first.json());
      assert.equal(first.json().states[0].stock, 8);
      assert.equal(
        (await f.pool.query('SELECT count(*) FROM sales')).rows[0].count,
        '1',
      );
      const receipt = await f.app.inject({
        url: `/v1/inventories/${a.inventoryId}/operations/${command.operationId}`,
        headers: { cookie: a.cookie },
      });
      assert.equal(receipt.statusCode, 200);
      createSchemaValidator(contractSchemas.OperationReceipt)(receipt.json());
      assert.equal(receipt.json().changeSet.upserts.saleItems.length, 1);
      assert.equal(
        (
          await post({
            ...command,
            payload: { ...command.payload, notes: 'Other' },
          })
        ).statusCode,
        409,
      );
    },
  );
  await t.test(
    'A/B foreign Product and Inventory requests are 404 with no foreign details or mutations',
    async () => {
      const foreign = saleCommand([
        {
          productId: product.payload.productId,
          quantity: 1,
          price: '7000000',
          cost: '5000000',
          estimatedCost: '5000000',
          estimatedProfit: '2000000',
        },
      ]);
      for (const url of [path(b), path(a)]) {
        const response = await post(foreign, headers(foreign, b), url);
        assert.equal(response.statusCode, 404);
        assert.doesNotMatch(
          response.body,
          /SALE_PRIVATE|stock|costStatus|barcode/,
        );
      }
      assert.equal(
        (
          await f.pool.query(
            'SELECT stock FROM inventory_states WHERE product_id=$1',
            [product.payload.productId],
          )
        ).rows[0].stock,
        '8',
      );
    },
  );
  await t.test(
    'cost conflicts are durable 409 without unapproved details; semantic corruption replays fail sanitized500',
    async () => {
      const stale = saleCommand([
          {
            productId: product.payload.productId,
            quantity: 1,
            price: '7000000',
            cost: '5000000',
            estimatedCost: '1',
            estimatedProfit: '2000000',
          },
        ]),
        conflict = await post(stale, headers(stale));
      assert.equal(conflict.statusCode, 409);
      assert.equal(conflict.json().error.code, 'COST_SNAPSHOT_CONFLICT');
      assert.equal(conflict.json().error.details, undefined);
      const revision = (
        await f.pool.query(
          'SELECT committed_revision FROM operation_receipts WHERE operation_id=$1',
          [command.operationId],
        )
      ).rows[0].committed_revision;
      const original = (
        await f.pool.query(
          'SELECT changes FROM inventory_change_sets WHERE inventory_id=$1 AND revision=$2',
          [a.inventoryId, revision],
        )
      ).rows[0].changes;
      await f.pool.query(
        'UPDATE inventory_change_sets SET changes=$1 WHERE inventory_id=$2 AND revision=$3',
        [
          {
            ...original,
            upserts: { ...original.upserts, inventoryStates: [] },
          },
          a.inventoryId,
          revision,
        ],
      );
      assert.equal((await post()).statusCode, 500);
      await f.pool.query(
        'UPDATE inventory_change_sets SET changes=$1 WHERE inventory_id=$2 AND revision=$3',
        [original, a.inventoryId, revision],
      );
    },
  );
  await t.test(
    'JSON Sale larger than Product32KiB succeeds within global1MiB, with normalized notes preserved',
    async () => {
      const large = saleCommand(
        [
          {
            productId: product.payload.productId,
            quantity: 1,
            price: '7000000',
            cost: '5000000',
            estimatedCost: '5000000',
            estimatedProfit: '2000000',
          },
        ],
        '  ' + 'n'.repeat(40000) + '  ',
      );
      const response = await post(large, headers(large));
      assert.equal(response.statusCode, 200);
      assert.equal(response.json().sale.notes.length, 40000);
    },
  );
  await t.test(
    'missing State corruption is sanitized500 without a terminal receipt',
    async () => {
      const saved = (
        await f.pool.query(
          'SELECT * FROM inventory_states WHERE product_id=$1',
          [product.payload.productId],
        )
      ).rows[0];
      const before = (
        await f.pool.query('SELECT count(*) FROM operation_receipts')
      ).rows[0].count;
      await f.pool.query('DELETE FROM inventory_states WHERE product_id=$1', [
        product.payload.productId,
      ]);
      const next = saleCommand([
        {
          productId: product.payload.productId,
          quantity: 1,
          price: '7000000',
          cost: '5000000',
          estimatedCost: '5000000',
          estimatedProfit: '2000000',
        },
      ]);
      assert.equal((await post(next, headers(next))).statusCode, 500);
      assert.equal(
        (await f.pool.query('SELECT count(*) FROM operation_receipts')).rows[0]
          .count,
        before,
      );
      await f.pool.query(
        'INSERT INTO inventory_states(inventory_id,product_id,stock,unit_cost_units,state_revision,last_movement_id) VALUES($1,$2,$3,$4,$5,$6)',
        [
          saved.inventory_id,
          saved.product_id,
          saved.stock,
          saved.unit_cost_units,
          saved.state_revision,
          saved.last_movement_id,
        ],
      );
    },
  );
  await t.test(
    'durable business command bucket limits Sale replay without new writes',
    async () => {
      now += 60001;
      for (let i = 0; i < 60; i++) assert.equal((await post()).statusCode, 200);
      const limited = await post();
      assert.equal(limited.statusCode, 429);
      assert.ok(limited.headers['retry-after']);
    },
  );
  assert.doesNotMatch(
    f.logs.join(''),
    /SALE_PRIVATE_CANARY|"(?:5000000|7000000)"|"(?:body|payload|unitCost|unitSalePrice|estimatedCost)"\s*:/,
  );
});
