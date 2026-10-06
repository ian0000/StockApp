import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createSchemaValidator,
  contractSchemas,
  type VoidSaleCommandResult,
} from '@stock-app/contracts';
import { authFixture } from '../auth/helpers.js';
import { createDatabase } from '../../src/infrastructure/postgres/client.js';
import { registerOwnershipRoutes } from '../../src/ownership/routes.js';
import { registerProductRoutes } from '../../src/products/routes.js';
import { registerVoidSaleRoutes } from '../../src/void-sales/routes.js';
import { resolveAuthenticatedUser } from '../../src/ownership/context.js';
import { bootstrapEmptyInventory } from '../../src/ownership/bootstrap.js';
import { createCommand } from '../products/helpers.js';
import { voidCommand } from './helpers.js';
import { saleCommand } from '../sales/helpers.js';
import { registerSaleRoutes } from '../../src/sales/routes.js';
import { id } from '../postgres/helpers.js';

test('VoidSale HTTP enforces direct mode, official security, strict transport, A/B and durable responses', async (t) => {
  let now = Date.now();
  const f = await authFixture(t, {}, () => now),
    db = createDatabase(f.pool);
  registerOwnershipRoutes(f.app, f.runtime.auth, db);
  registerProductRoutes(f.app, f.runtime.auth, db);
  registerVoidSaleRoutes(f.app, f.runtime.auth, db, () => 2000);
  registerSaleRoutes(f.app, f.runtime.auth, db);
  async function owner(letter: string) {
    now += 3600001;
    const email = `void-${letter}@example.test`;
    await f.signup(email);
    await f.verify(email);
    const { cookie } = await f.signin(email),
      auth = await resolveAuthenticatedUser(f.runtime.auth, { cookie }),
      dataset = await bootstrapEmptyInventory(db, auth.user.id, {
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
    b = await owner('b'),
    base = (scope = a) =>
      `/v1/inventories/${scope.inventoryId}/sales/${sale.payload.saleId}/void`;
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
    name: 'VOID_PRIVATE_CANARY',
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
  const sale = saleCommand([
    {
      productId: product.payload.productId,
      quantity: 2,
      price: '15000000',
      cost: '10000000',
      estimatedCost: '20000000',
      estimatedProfit: '10000000',
    },
  ]);
  sale.occurredAt = 900;
  sale.payload.createdAt = 1000;
  assert.equal(
    (
      await f.app.inject({
        method: 'POST',
        url: `/v1/inventories/${a.inventoryId}/sales`,
        payload: sale,
        headers: headers(sale),
      })
    ).statusCode,
    200,
  );
  const command = voidCommand(sale.payload.saleId, [
    {
      productId: product.payload.productId,
      expectedStateRevision: '1',
      expectedState: {
        stock: 18,
        unitCost: '10000000',
        lastMovementId: sale.payload.items[0].movementId,
      },
    },
  ]);
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
        /VOID_PRIVATE|10000000|constraint|SELECT|stack/,
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
    'direct operation-ref revision rejects before Inventory lock/receipt; global envelope unchanged',
    async () => {
      const parent = id(),
        ref = {
          ...command,
          dependsOn: [parent],
          preconditions: {
            states: command.preconditions.states.map((s) => ({
              ...s,
              expectedStateRevision: { operationId: parent },
            })),
          },
        };
      createSchemaValidator(contractSchemas.VoidSaleCommand)(ref);
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
        const response = await Promise.race([
          post(ref),
          new Promise<never>((_resolve, reject) => {
            const timeout = setTimeout(
              () =>
                reject(new Error('Direct refusal waited for Inventory lock.')),
              1000,
            );
            timeout.unref();
          }),
        ]);
        assert.equal(response.statusCode, 400);
        assert.equal(response.json().error.code, 'VALIDATION_ERROR');
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
  const legacy = '550e8400-e29b-41d4-a716-446655440000',
    evidence = command.preconditions.states[0],
    identity = command.payload.reversalMovements[0];
  const invalids: [string, unknown, number][] = [
    ['wrong kind', product, 400],
    ['missing state', { ...command, preconditions: {} }, 400],
    [
      'missing reversals',
      {
        ...command,
        payload: { saleId: command.payload.saleId, createdAt: 1600 },
      },
      400,
    ],
    [
      'mass assignment',
      {
        ...command,
        payload: {
          ...command.payload,
          status: 'VOIDED',
          inventoryId: a.inventoryId,
        },
      },
      400,
    ],
    [
      'empty reversals',
      { ...command, payload: { ...command.payload, reversalMovements: [] } },
      400,
    ],
    [
      'duplicate product',
      {
        ...command,
        payload: {
          ...command.payload,
          reversalMovements: [identity, { ...identity, movementId: id() }],
        },
        preconditions: { states: [evidence, evidence] },
      },
      400,
    ],
    [
      'duplicate new identity',
      {
        ...command,
        payload: {
          ...command.payload,
          reversalMovements: [{ ...identity, movementId: command.operationId }],
        },
      },
      400,
    ],
    [
      'foreign evidence set',
      {
        ...command,
        preconditions: { states: [{ ...evidence, productId: id() }] },
      },
      400,
    ],
    [
      'fraction stock',
      {
        ...command,
        preconditions: {
          states: [
            {
              ...evidence,
              expectedState: { ...evidence.expectedState, stock: 1.5 },
            },
          ],
        },
      },
      400,
    ],
    [
      'invalid revision',
      {
        ...command,
        preconditions: {
          states: [{ ...evidence, expectedStateRevision: '-1' }],
        },
      },
      400,
    ],
    ['v4 operation', { ...command, operationId: legacy }, 400],
    [
      'v4 new reversal',
      {
        ...command,
        payload: {
          ...command.payload,
          reversalMovements: [{ ...identity, movementId: legacy }],
        },
      },
      400,
    ],
    [
      'path/body mismatch',
      { ...command, payload: { ...command.payload, saleId: id() } },
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
            "SELECT count(*) FROM operation_receipts WHERE kind='SALE_VOID'",
          )
        ).rows[0].count,
        '0',
      );
    });
  await t.test('exact CORS preflight', async () => {
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
  await t.test(
    'verified email required with official session/CSRF',
    async () => {
      await f.pool.query('UPDATE "user" SET email_verified=false WHERE id=$1', [
        a.userId,
      ]);
      try {
        assert.equal((await post()).statusCode, 403);
      } finally {
        await f.pool.query(
          'UPDATE "user" SET email_verified=true WHERE id=$1',
          [a.userId],
        );
      }
    },
  );
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
  let original: VoidSaleCommandResult | undefined;
  function assertResult(
    value: unknown,
  ): asserts value is VoidSaleCommandResult {
    createSchemaValidator(contractSchemas.VoidSaleResult)(value);
  }
  await t.test(
    'same-operation concurrent HTTP writes once and durably replays VOIDED',
    async () => {
      now += 60001;
      const [first, second] = await Promise.all([
        post(),
        post(command, { 'idempotency-key': command.operationId.toUpperCase() }),
      ]);
      assert.equal(first.statusCode, 200);
      assert.equal(second.statusCode, 200);
      assert.deepEqual(first.json(), second.json());
      const accepted: unknown = first.json();
      assertResult(accepted);
      original = accepted;
      assert.equal(original.kind, 'VOIDED');
      assert.equal(original.sale.status, 'VOIDED');
      assert.equal(original.states[0].stock, 20);
      assert.equal(original.states[0].stateRevision, '2');
      assert.equal(
        original.reversals[0].reversalOfMovementId,
        sale.payload.items[0].movementId,
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
  await t.test(
    'distinct stale Void stays durable409, distinct current VOIDED command rejects422 without no-op',
    async () => {
      const stale = {
          ...command,
          operationId: id(),
          payload: {
            ...command.payload,
            reversalMovements: [{ ...identity, movementId: id() }],
          },
        },
        first = await post(stale, headers(stale));
      assert.equal(first.statusCode, 409);
      assert.equal(first.json().error.code, 'REVISION_CONFLICT');
      assert.equal((await post(stale, headers(stale))).statusCode, 409);
      const row = (
          await f.pool.query(
            'SELECT * FROM inventory_states WHERE product_id=$1',
            [product.payload.productId],
          )
        ).rows[0],
        current = voidCommand(sale.payload.saleId, [
          {
            productId: row.product_id,
            expectedStateRevision: row.state_revision,
            expectedState: {
              stock: Number(row.stock),
              unitCost: row.unit_cost_units,
              lastMovementId: row.last_movement_id,
            },
          },
        ]),
        before = (
          await f.pool.query('SELECT revision FROM inventories WHERE id=$1', [
            a.inventoryId,
          ])
        ).rows[0].revision;
      const rejected = await post(current, headers(current));
      assert.equal(rejected.statusCode, 422);
      assert.equal(rejected.json().error.code, 'VOID_NOT_ELIGIBLE');
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
  await t.test(
    'A/B isolation conceals foreign Sale and Inventory',
    async () => {
      now += 60001;
      const foreign = { ...command, operationId: id() };
      assert.equal(
        (await post(foreign, headers(foreign, b), base(b))).statusCode,
        404,
      );
      assert.equal((await post(foreign, headers(foreign, b))).statusCode, 404);
    },
  );
  await t.test(
    'valid40KiB JSON whitespace is accepted under global1MiB bound',
    async () => {
      now += 60001;
      assert.equal(
        (await post(JSON.stringify(command) + ' '.repeat(40000))).statusCode,
        200,
      );
    },
  );
  await t.test(
    'missing state sanitizes500 before ALREADY_VOIDED, without terminal receipt',
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
    'corrupt durable Void response sanitizes500 without another reversal',
    async () => {
      assert.ok(original);
      const revision = original.committedRevision,
        saved = (
          await f.pool.query(
            'SELECT changes FROM inventory_change_sets WHERE inventory_id=$1 AND revision=$2',
            [a.inventoryId, revision],
          )
        ).rows[0].changes;
      await f.pool.query(
        "UPDATE inventory_change_sets SET changes=jsonb_set(changes,'{upserts,sales}','[]'::jsonb) WHERE inventory_id=$1 AND revision=$2",
        [a.inventoryId, revision],
      );
      assert.equal((await post()).statusCode, 500);
      assert.equal(
        (
          await f.pool.query(
            "SELECT count(*) FROM inventory_movements WHERE type='REVERSAL'",
          )
        ).rows[0].count,
        '1',
      );
      await f.pool.query(
        'UPDATE inventory_change_sets SET changes=$1 WHERE inventory_id=$2 AND revision=$3',
        [saved, a.inventoryId, revision],
      );
    },
  );
  await t.test(
    'durable command bucket limits even replay60/61 with Retry-After',
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
    /VOID_PRIVATE_CANARY|"(?:10000000|20000000)"|"(?:body|payload|unitCost|estimatedProfit)"\s*:/,
  );
});
