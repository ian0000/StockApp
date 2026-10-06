import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSchemaValidator, contractSchemas } from '@stock-app/contracts';
import { authFixture } from '../auth/helpers.js';
import { createDatabase } from '../../src/infrastructure/postgres/client.js';
import { registerOwnershipRoutes } from '../../src/ownership/routes.js';
import { registerProductRoutes } from '../../src/products/routes.js';
import { registerPurchaseRoutes } from '../../src/purchases/routes.js';
import { resolveAuthenticatedUser } from '../../src/ownership/context.js';
import { bootstrapEmptyInventory } from '../../src/ownership/bootstrap.js';
import { createCommand } from '../products/helpers.js';
import { purchaseCommand } from './helpers.js';
import { id } from '../postgres/helpers.js';

test('Purchase HTTP enforces direct mode, official security, strict transport, A/B and durable responses', async (t) => {
  let now = Date.now();
  const f = await authFixture(t, {}, () => now),
    db = createDatabase(f.pool);
  registerOwnershipRoutes(f.app, f.runtime.auth, db);
  registerProductRoutes(f.app, f.runtime.auth, db);
  registerPurchaseRoutes(f.app, f.runtime.auth, db, () => 2000);
  async function owner(letter: string) {
    now += 3600001;
    const email = `purchase-${letter}@example.test`;
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
    base = (scope = a) => `/v1/inventories/${scope.inventoryId}/purchases`;
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
    name: 'PURCHASE_PRIVATE_CANARY',
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
  const command = purchaseCommand(product.payload.productId, 10, '12000000', {
    expectedStateRevision: '0',
    expectedState: {
      stock: 20,
      unitCost: '10000000',
      lastMovementId: product.payload.initialMovementId,
    },
  });
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
        /PURCHASE_PRIVATE|10000000|constraint|SELECT|stack/,
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
        (await f.pool.query('SELECT count(*) FROM purchases')).rows[0].count,
        '0',
      );
    });
  await t.test(
    'operation-ref revision is globally valid but direct HTTP rejects400 before any Inventory lock/receipt',
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
      createSchemaValidator(contractSchemas.RegisterPurchaseCommand)(ref);
      const before = (
        await f.pool.query('SELECT count(*) FROM operation_receipts')
      ).rows[0].count;
      // Lock Inventory independently: direct-mode denial must not wait for CommandTransaction.
      const blocker = await f.pool.connect();
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
                reject(
                  new Error(
                    'Direct revision denial waited for the Inventory lock.',
                  ),
                ),
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
  const invalids: [string, unknown, number][] = [
    ['wrong kind', product, 400],
    ['missing state', { ...command, preconditions: {} }, 400],
    [
      'mass assignment',
      {
        ...command,
        payload: {
          ...command.payload,
          totalAmount: '120000000',
          inventoryId: a.inventoryId,
          priceAnalysis: {},
        },
      },
      400,
    ],
    [
      'zero quantity',
      { ...command, payload: { ...command.payload, quantity: 0 } },
      400,
    ],
    [
      'fraction quantity',
      { ...command, payload: { ...command.payload, quantity: 0.5 } },
      400,
    ],
    [
      'unsafe quantity',
      {
        ...command,
        payload: { ...command.payload, quantity: 9007199254740992 },
      },
      400,
    ],
    [
      'negative cost',
      { ...command, payload: { ...command.payload, unitCost: '-1' } },
      400,
    ],
    [
      'unsafe money',
      {
        ...command,
        payload: { ...command.payload, unitCost: '9007199254740992' },
      },
      400,
    ],
    [
      'float money',
      { ...command, payload: { ...command.payload, unitCost: '12.0' } },
      400,
    ],
    [
      'duplicate identities',
      {
        ...command,
        payload: { ...command.payload, movementId: command.payload.purchaseId },
      },
      400,
    ],
    [
      'missing notes',
      { ...command, payload: { ...command.payload, notes: undefined } },
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
  for (const field of ['operationId', 'purchaseId', 'movementId']) {
    const legacy = '550e8400-e29b-41d4-a716-446655440000';
    invalids.push([
      `v4 ${field}`,
      field === 'operationId'
        ? { ...command, operationId: legacy }
        : { ...command, payload: { ...command.payload, [field]: legacy } },
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
            "SELECT count(*) FROM operation_receipts WHERE kind='PURCHASE_REGISTER'",
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
    await t.test(`business ${status} denies403`, async () => {
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
    'verified email is required even with a session and CSRF',
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
    await t.test(`official session ${state} denies401`, async () => {
      const ownerWithSession = await owner(state);
      await f.pool.query(
        state === 'expired'
          ? 'UPDATE "session" SET expires_at=now()-interval \'1 second\' WHERE user_id=$1'
          : 'DELETE FROM "session" WHERE user_id=$1',
        [ownerWithSession.userId],
      );
      assert.equal(
        (await post(command, headers(command, ownerWithSession))).statusCode,
        401,
      );
    });
  await t.test(
    'same operation concurrent HTTP creates one Purchase and replays exact result',
    async () => {
      now += 60001;
      const [first, second] = await Promise.all([
        post(),
        post(command, { 'idempotency-key': command.operationId.toUpperCase() }),
      ]);
      assert.equal(first.statusCode, 200);
      assert.equal(second.statusCode, 200);
      assert.deepEqual(first.json(), second.json());
      createSchemaValidator(contractSchemas.RegisterPurchaseResult)(
        first.json(),
      );
      assert.equal(first.json().purchase.averageCostAfter, '10666667');
      assert.equal(first.json().movement.unitCostSnapshot, '12000000');
      assert.equal(first.json().afterState.unitCost, '10666667');
      assert.equal(first.json().product.metadataRevision, '0');
      const receipt = await f.app.inject({
        url: `/v1/inventories/${a.inventoryId}/operations/${command.operationId}`,
        headers: { cookie: a.cookie },
      });
      assert.equal(receipt.statusCode, 200);
      assert.equal(receipt.json().status, 'ACCEPTED');
      assert.equal(
        (
          await post({
            ...command,
            payload: { ...command.payload, notes: 'Changed' },
          })
        ).statusCode,
        409,
      );
      assert.equal(
        (await f.pool.query('SELECT count(*) FROM purchases')).rows[0].count,
        '1',
      );
    },
  );
  await t.test(
    'A/B isolation does not leak foreign Product or Inventory',
    async () => {
      now += 60001;
      const foreign = purchaseCommand(product.payload.productId);
      assert.equal(
        (await post(foreign, headers(foreign, b), base(b))).statusCode,
        404,
      );
      assert.equal((await post(foreign, headers(foreign, b))).statusCode, 404);
    },
  );
  await t.test(
    'stale exact-state gets durable409 with currentRevision only',
    async () => {
      const stale = {
          ...command,
          operationId: id(),
          payload: { ...command.payload, purchaseId: id(), movementId: id() },
        },
        first = await post(stale, headers(stale));
      assert.equal(first.statusCode, 409);
      assert.equal(first.json().error.code, 'REVISION_CONFLICT');
      assert.deepEqual(first.json().error.details, { currentRevision: '1' });
      assert.equal((await post(stale, headers(stale))).statusCode, 409);
    },
  );
  await t.test('valid global-size notes can exceed Product32KiB', async () => {
    now += 60001;
    const row = (
        await f.pool.query(
          'SELECT * FROM inventory_states WHERE product_id=$1',
          [product.payload.productId],
        )
      ).rows[0],
      next = purchaseCommand(product.payload.productId, 1, '12000000', {
        expectedStateRevision: row.state_revision,
        expectedState: {
          stock: Number(row.stock),
          unitCost: row.unit_cost_units,
          lastMovementId: row.last_movement_id,
        },
      });
    next.payload.notes = 'n'.repeat(40000);
    assert.equal((await post(next, headers(next))).statusCode, 200);
  });
  await t.test(
    'missing State is sanitized500 without terminal receipt',
    async () => {
      const saved = (
          await f.pool.query(
            'SELECT * FROM inventory_states WHERE product_id=$1',
            [product.payload.productId],
          )
        ).rows[0],
        next = purchaseCommand(product.payload.productId),
        before = (await f.pool.query('SELECT count(*) FROM operation_receipts'))
          .rows[0].count;
      await f.pool.query('DELETE FROM inventory_states WHERE product_id=$1', [
        product.payload.productId,
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
    'corrupt durable Product snapshot replay fails500 without new effects',
    async () => {
      const revision = (await post()).json().committedRevision;
      assert.ok(revision);
      const saved = (
        await f.pool.query(
          'SELECT changes FROM inventory_change_sets WHERE inventory_id=$1 AND revision=$2',
          [a.inventoryId, revision],
        )
      ).rows[0].changes;
      const before = (await f.pool.query('SELECT count(*) FROM purchases'))
        .rows[0].count;
      await f.pool.query(
        "UPDATE inventory_change_sets SET changes=jsonb_set(changes,'{upserts,products}','[]'::jsonb) WHERE inventory_id=$1 AND revision=$2",
        [a.inventoryId, revision],
      );
      assert.equal((await post()).statusCode, 500);
      assert.equal(
        (await f.pool.query('SELECT count(*) FROM purchases')).rows[0].count,
        before,
      );
      await f.pool.query(
        'UPDATE inventory_change_sets SET changes=$1 WHERE inventory_id=$2 AND revision=$3',
        [saved, a.inventoryId, revision],
      );
    },
  );
  await t.test(
    'durable command bucket denies429 even replay, with Retry-After',
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
    /PURCHASE_PRIVATE_CANARY|"(?:10000000|12000000)"|"(?:body|payload|unitCost|priceAnalysis)"\s*:/,
  );
});
