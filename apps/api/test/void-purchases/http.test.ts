import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSchemaValidator, contractSchemas } from '@stock-app/contracts';
import { authFixture } from '../auth/helpers.js';
import { createDatabase } from '../../src/infrastructure/postgres/client.js';
import { registerOwnershipRoutes } from '../../src/ownership/routes.js';
import { registerProductRoutes } from '../../src/products/routes.js';
import { registerPurchaseRoutes } from '../../src/purchases/routes.js';
import { registerVoidPurchaseRoutes } from '../../src/void-purchases/routes.js';
import { resolveAuthenticatedUser } from '../../src/ownership/context.js';
import { bootstrapEmptyInventory } from '../../src/ownership/bootstrap.js';
import { createCommand } from '../products/helpers.js';
import { purchaseCommand } from '../purchases/helpers.js';
import { voidPurchaseCommand } from './helpers.js';
import { id } from '../postgres/helpers.js';

test('VoidPurchase HTTP validates direct transport, official security, A/B and durable exact restoration', async (t) => {
  let now = Date.now();
  const f = await authFixture(t, {}, () => now),
    db = createDatabase(f.pool);
  registerOwnershipRoutes(f.app, f.runtime.auth, db);
  registerProductRoutes(f.app, f.runtime.auth, db);
  registerPurchaseRoutes(f.app, f.runtime.auth, db);
  registerVoidPurchaseRoutes(f.app, f.runtime.auth, db, () => 2000);
  async function owner(letter: string) {
    now += 3600001;
    const email = `void-purchase-${letter}@example.test`;
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
      userId: auth.user.id,
    };
  }
  const a = await owner('a'),
    b = await owner('b');
  const headers = (command: { operationId: string }, scope = a) => ({
    cookie: scope.cookie,
    origin: f.config.appOrigin,
    'x-csrf-token': scope.csrf,
    'content-type': 'application/json',
    'idempotency-key': command.operationId,
  });
  const product = createCommand({
    initialStock: 20,
    initialUnitCost: '10000000',
    initialMovementId: id(),
    regularSalePrice: '15000000',
    name: 'VOID_PURCHASE_PRIVATE_CANARY_Q7X9K2',
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
  const purchase = purchaseCommand(product.payload.productId, 10, '12000000', {
    expectedStateRevision: '0',
    expectedState: {
      stock: 20,
      unitCost: '10000000',
      lastMovementId: product.payload.initialMovementId,
    },
  });
  purchase.occurredAt = 900;
  purchase.payload.createdAt = 1000;
  assert.equal(
    (
      await f.app.inject({
        method: 'POST',
        url: `/v1/inventories/${a.inventoryId}/purchases`,
        payload: purchase,
        headers: headers(purchase),
      })
    ).statusCode,
    200,
  );
  const command = voidPurchaseCommand(
    purchase.payload.purchaseId.toUpperCase(),
    {
      expectedStateRevision: '1',
      expectedState: {
        stock: 30,
        unitCost: '10666667',
        lastMovementId: purchase.payload.movementId,
      },
    },
  );
  const base = (scope = a) =>
    `/v1/inventories/${scope.inventoryId}/purchases/${purchase.payload.purchaseId}/void`;
  async function post(
    body: unknown = command,
    extra: Record<string, string> = {},
    url = base(),
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
        /PRIVATE_CANARY|constraint|SELECT|stack/,
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
    });
  await t.test(
    'operation-ref and path/body mismatch reject before lock and receipt',
    async () => {
      const parent = id(),
        ref = {
          ...command,
          dependsOn: [parent],
          preconditions: {
            ...command.preconditions,
            expectedStateRevision: { operationId: parent },
          },
        };
      createSchemaValidator(contractSchemas.VoidPurchaseCommand)(ref);
      const before = (
          await f.pool.query('SELECT count(*) FROM operation_receipts')
        ).rows[0].count,
        blocker = await f.pool.connect();
      try {
        await blocker.query('BEGIN');
        await blocker.query(
          'SELECT id FROM inventories WHERE id=$1 FOR UPDATE',
          [a.inventoryId],
        );
        for (const body of [
          ref,
          { ...command, payload: { ...command.payload, purchaseId: id() } },
        ]) {
          const response = await Promise.race([
            post(body),
            new Promise<never>((_resolve, reject) => {
              const timeout = setTimeout(
                () =>
                  reject(
                    new Error('Direct refusal waited for Inventory lock.'),
                  ),
                1000,
              );
              timeout.unref();
            }),
          ]);
          assert.equal(response.statusCode, 400);
          assert.equal(response.json().error.code, 'VALIDATION_ERROR');
        }
      } finally {
        await blocker.query('ROLLBACK');
        blocker.release();
      }
      assert.equal(
        (await f.pool.query('SELECT count(*) FROM operation_receipts')).rows[0]
          .count,
        before,
      );
    },
  );
  const legacy = '550e8400-e29b-41d4-a716-446655440000';
  const invalids: [string, unknown, number][] = [
    ['wrong kind', product, 400],
    ['missing state', { ...command, preconditions: {} }, 400],
    [
      'mass assignment',
      {
        ...command,
        payload: {
          ...command.payload,
          productId: product.payload.productId,
          inventoryId: a.inventoryId,
          status: 'VOIDED',
        },
      },
      400,
    ],
    [
      'duplicate new identity',
      {
        ...command,
        payload: {
          ...command.payload,
          reversalMovementId: command.operationId,
        },
      },
      400,
    ],
    [
      'fraction stock',
      {
        ...command,
        preconditions: {
          ...command.preconditions,
          expectedState: { ...command.preconditions.expectedState, stock: 1.5 },
        },
      },
      400,
    ],
    [
      'invalid revision',
      {
        ...command,
        preconditions: {
          ...command.preconditions,
          expectedStateRevision: '-1',
        },
      },
      400,
    ],
    ['v4 operation', { ...command, operationId: legacy }, 400],
    [
      'v4 new reversal',
      {
        ...command,
        payload: { ...command.payload, reversalMovementId: legacy },
      },
      400,
    ],
    ['malformed JSON', '{', 400],
    [
      'large body',
      {
        ...command,
        payload: { ...command.payload, notes: 'x'.repeat(1024 * 1024) },
      },
      413,
    ],
  ];
  for (const [label, body, status] of invalids)
    await t.test(label, async () => {
      now += 60001;
      assert.equal((await post(body)).statusCode, status);
      assert.equal(
        (
          await f.pool.query(
            "SELECT count(*) FROM operation_receipts WHERE kind='PURCHASE_VOID'",
          )
        ).rows[0].count,
        '0',
      );
    });
  await t.test('exact credentialed CORS preflight', async () => {
    const response = await f.app.inject({
      method: 'OPTIONS',
      url: base(),
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
    assert.equal(response.headers['access-control-allow-credentials'], 'true');
  });
  for (const status of ['disabled', 'DELETING'])
    await t.test(`business ${status} refuses403`, async () => {
      await f.pool.query(
        status === 'disabled'
          ? 'UPDATE businesses SET cloud_access_enabled=false WHERE id=$1'
          : "UPDATE businesses SET status='DELETING' WHERE id=$1",
        [a.businessId],
      );
      assert.equal((await post()).statusCode, 403);
      await f.pool.query(
        "UPDATE businesses SET status='ACTIVE',cloud_access_enabled=true WHERE id=$1",
        [a.businessId],
      );
    });
  await t.test('verified email required', async () => {
    await f.pool.query('UPDATE "user" SET email_verified=false WHERE id=$1', [
      a.userId,
    ]);
    try {
      assert.equal((await post()).statusCode, 403);
    } finally {
      await f.pool.query('UPDATE "user" SET email_verified=true WHERE id=$1', [
        a.userId,
      ]);
    }
  });
  for (const state of ['expired', 'revoked'])
    await t.test(`session ${state} refuses401`, async () => {
      const scope = await owner(state);
      await f.pool.query(
        state === 'expired'
          ? 'UPDATE "session" SET expires_at=now()-interval \'1 second\' WHERE user_id=$1'
          : 'DELETE FROM "session" WHERE user_id=$1',
        [scope.userId],
      );
      assert.equal(
        (await post(command, headers(command, scope))).statusCode,
        401,
      );
    });
  await t.test(
    'uppercase path/body, same operation concurrent and durable VOIDED replay',
    async () => {
      now += 60001;
      const [first, second] = await Promise.all([
        post(
          command,
          {},
          `/v1/inventories/${a.inventoryId.toUpperCase()}/purchases/${purchase.payload.purchaseId.toUpperCase()}/void`,
        ),
        post(command, { 'idempotency-key': command.operationId.toUpperCase() }),
      ]);
      assert.equal(first.statusCode, 200);
      assert.equal(second.statusCode, 200);
      assert.deepEqual(first.json(), second.json());
      createSchemaValidator(contractSchemas.VoidPurchaseResult)(first.json());
      assert.equal(first.json().purchase.status, 'VOIDED');
      assert.equal(first.json().states[0].stock, 20);
      assert.equal(first.json().states[0].unitCost, '10000000');
      assert.equal(first.json().states[0].stateRevision, '2');
      assert.equal(first.json().reversals[0].unitCostSnapshot, '12000000');
      assert.equal(
        first.json().reversals[0].reversalOfMovementId,
        purchase.payload.movementId,
      );
      const receipt = await f.app.inject({
        url: `/v1/inventories/${a.inventoryId}/operations/${command.operationId}`,
        headers: { cookie: a.cookie },
      });
      assert.equal(receipt.statusCode, 200);
      assert.equal(receipt.json().status, 'ACCEPTED');
      assert.equal(
        (await post({ ...command, occurredAt: 1501 })).statusCode,
        409,
      );
    },
  );
  await t.test(
    'stale distinct command conflicts before VOIDED; current distinct rejects without no-op',
    async () => {
      const stale = {
        ...command,
        operationId: id(),
        payload: { ...command.payload, reversalMovementId: id() },
      };
      assert.equal((await post(stale, headers(stale))).statusCode, 409);
      assert.equal((await post(stale, headers(stale))).statusCode, 409);
      const row = (
        await f.pool.query(
          'SELECT * FROM inventory_states WHERE product_id=$1',
          [product.payload.productId],
        )
      ).rows[0];
      const current = voidPurchaseCommand(purchase.payload.purchaseId, {
        expectedStateRevision: row.state_revision,
        expectedState: {
          stock: Number(row.stock),
          unitCost: row.unit_cost_units,
          lastMovementId: row.last_movement_id,
        },
      });
      const before = (
        await f.pool.query('SELECT revision FROM inventories WHERE id=$1', [
          a.inventoryId,
        ])
      ).rows[0].revision;
      assert.equal(
        (await post(current, headers(current))).json().error.code,
        'VOID_NOT_ELIGIBLE',
      );
      assert.equal((await post(current, headers(current))).statusCode, 422);
      assert.equal(
        (
          await f.pool.query('SELECT revision FROM inventories WHERE id=$1', [
            a.inventoryId,
          ])
        ).rows[0].revision,
        before,
      );
    },
  );
  await t.test('A/B conceals foreign Purchase and Inventory', async () => {
    now += 60001;
    const foreign = { ...command, operationId: id() };
    assert.equal(
      (await post(foreign, headers(foreign, b), base(b))).statusCode,
      404,
    );
    assert.equal((await post(foreign, headers(foreign, b))).statusCode, 404);
  });
  await t.test(
    'valid40KiB whitespace stays under the global bound',
    async () => {
      now += 60001;
      assert.equal(
        (await post(JSON.stringify(command) + ' '.repeat(40000))).statusCode,
        200,
      );
    },
  );
  await t.test(
    'missing State gives sanitized500 before already VOIDED with no receipt',
    async () => {
      const row = (
          await f.pool.query(
            'SELECT * FROM inventory_states WHERE product_id=$1',
            [product.payload.productId],
          )
        ).rows[0],
        next = { ...command, operationId: id() },
        before = (await f.pool.query('SELECT count(*) FROM operation_receipts'))
          .rows[0].count;
      await f.pool.query('DELETE FROM inventory_states WHERE product_id=$1', [
        row.product_id,
      ]);
      assert.equal((await post(next, headers(next))).statusCode, 500);
      assert.equal(
        (await f.pool.query('SELECT count(*) FROM operation_receipts')).rows[0]
          .count,
        before,
      );
      await f.pool.query(
        'INSERT INTO inventory_states(inventory_id,product_id,stock,unit_cost_units,state_revision,last_movement_id)VALUES($1,$2,$3,$4,$5,$6)',
        [
          row.inventory_id,
          row.product_id,
          row.stock,
          row.unit_cost_units,
          row.state_revision,
          row.last_movement_id,
        ],
      );
    },
  );
  await t.test(
    'corrupt ChangeSet fails500 without another reversal',
    async () => {
      const row = (
        await f.pool.query(
          'SELECT c.revision,c.changes FROM inventory_change_sets c JOIN inventories i ON i.id=c.inventory_id JOIN operation_receipts r ON r.business_id=i.business_id AND r.committed_revision=c.revision WHERE c.inventory_id=$1 AND r.operation_id=$2',
          [a.inventoryId, command.operationId],
        )
      ).rows[0];
      await f.pool.query(
        "UPDATE inventory_change_sets SET changes=jsonb_set(changes,'{upserts,purchases}','[]'::jsonb) WHERE inventory_id=$1 AND revision=$2",
        [a.inventoryId, row.revision],
      );
      assert.equal((await post()).statusCode, 500);
      await f.pool.query(
        'UPDATE inventory_change_sets SET changes=$1 WHERE inventory_id=$2 AND revision=$3',
        [row.changes, a.inventoryId, row.revision],
      );
      assert.equal(
        (
          await f.pool.query(
            "SELECT count(*) FROM inventory_movements WHERE type='REVERSAL'",
          )
        ).rows[0].count,
        '1',
      );
    },
  );
  await t.test('durable command bucket limits replay60/61', async () => {
    now += 60001;
    for (let i = 0; i < 60; i++) assert.equal((await post()).statusCode, 200);
    const limited = await post();
    assert.equal(limited.statusCode, 429);
    assert.ok(limited.headers['retry-after']);
  });
  assert.doesNotMatch(
    f.logs.join(''),
    /VOID_PURCHASE_PRIVATE_CANARY_Q7X9K2|"(?:body|payload|unitCost|averageCostBefore)"\s*:/,
  );
});
