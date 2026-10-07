import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contractSchemas, createSchemaValidator } from '@stock-app/contracts';
import { authFixture } from '../auth/helpers.js';
import { createDatabase } from '../../src/infrastructure/postgres/client.js';
import { registerOwnershipRoutes } from '../../src/ownership/routes.js';
import { registerProductRoutes } from '../../src/products/routes.js';
import { registerReadRoutes } from '../../src/read-models/routes.js';
import { resolveAuthenticatedUser } from '../../src/ownership/context.js';
import { bootstrapEmptyInventory } from '../../src/ownership/bootstrap.js';
import { createCommand } from '../products/helpers.js';
import { id } from '../postgres/helpers.js';

test('all eight read routes enforce official auth/ownership/security, strict queries, private transport and no command writes', async (t) => {
  let now = Date.now();
  const f = await authFixture(t, {}, () => now),
    db = createDatabase(f.pool);
  registerOwnershipRoutes(f.app, f.runtime.auth, db);
  registerProductRoutes(f.app, f.runtime.auth, db);
  registerReadRoutes(f.app, f.runtime.auth, db, f.config.secret, () =>
    Date.parse('2026-05-01T12:00:00Z'),
  );
  async function owner(label: string) {
    now += 3600001;
    const email = `read-${label}@example.test`;
    await f.signup(email);
    await f.verify(email);
    const { cookie } = await f.signin(email),
      authenticated = await resolveAuthenticatedUser(f.runtime.auth, {
        cookie,
      }),
      dataset = await bootstrapEmptyInventory(db, authenticated.user.id, {
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
      inventoryId: dataset.inventory.id,
      businessId: dataset.business.id,
      userId: authenticated.user.id,
      csrf: String(csrf.json().token),
    };
  }
  const a = await owner('a'),
    b = await owner('b');
  async function product(scope = a) {
    const command = createCommand({
      name: 'READ_PRODUCT_PRIVATE_CANARY_Q7X9K2',
      barcode: '001234',
      initialStock: 20,
      initialUnitCost: '10000000',
      initialMovementId: id(),
      regularSalePrice: '15000000',
      minimumStock: 25,
    });
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: `/v1/inventories/${scope.inventoryId}/products`,
          payload: command,
          headers: {
            cookie: scope.cookie,
            origin: f.config.appOrigin,
            'x-csrf-token': scope.csrf,
            'idempotency-key': command.operationId,
          },
        })
      ).statusCode,
      200,
    );
    return command.payload.productId;
  }
  const own = await product(),
    foreign = await product(b),
    missing = id();
  const routes = [
    '/dashboard',
    '/products',
    '/products/by-barcode?code=001234',
    `/products/${own}`,
    '/stock-low',
    `/sales/${missing}`,
    `/purchases/${missing}`,
    '/history',
  ];
  const before = (
      await f.pool.query('SELECT revision FROM inventories WHERE id=$1', [
        a.inventoryId,
      ])
    ).rows[0].revision,
    receipts = (await f.pool.query('SELECT count(*) FROM operation_receipts'))
      .rows[0].count;
  async function get(
    suffix: string,
    scope = a,
    extra: Record<string, string> = {},
  ) {
    const response = await f.app.inject({
      url: `/v1/inventories/${scope.inventoryId}${suffix}`,
      headers: { cookie: scope.cookie, ...extra },
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
        /READ_PRODUCT_PRIVATE|SELECT|constraint|stack/,
      );
    }
    return response;
  }
  for (const suffix of routes)
    await t.test(
      `auth and foreign Inventory scoped before ${suffix.split('?')[0]}`,
      async () => {
        assert.equal((await get(suffix, a, { cookie: '' })).statusCode, 401);
        const response = await f.app.inject({
          url: `/v1/inventories/${b.inventoryId}${suffix}`,
          headers: { cookie: a.cookie },
        });
        assert.equal(response.statusCode, 404);
        assert.doesNotMatch(response.body, /READ_PRODUCT_PRIVATE|001234/);
      },
    );
  await t.test(
    'GET needs no CSRF or Idempotency-Key and preserves Product/State metadata revisions',
    async () => {
      const response = await get(`/products/${own}`, a, {
        'x-csrf-token': 'incorrect-and-unused',
      });
      assert.equal(response.statusCode, 200);
      createSchemaValidator(contractSchemas.ProductRead)(response.json());
      assert.equal(response.json().state.stock, 20);
      assert.equal(response.json().state.stateRevision, '0');
      assert.equal(response.json().product.metadataRevision, '0');
      assert.equal(response.json().isLowStock, true);
      assert.equal((await get('/products')).json().items.length, 1);
      assert.equal((await get('/stock-low')).json().items.length, 1);
      assert.equal(
        (await get('/products/by-barcode?code=001234')).statusCode,
        200,
      );
      assert.equal(
        (await get('/products/by-barcode?code=1234')).statusCode,
        404,
      );
      assert.equal((await get(`/products/${foreign}`)).statusCode, 404);
    },
  );
  for (const suffix of [
    '/products?limit=101',
    '/products?limit=0',
    '/products?limit=01',
    '/products?limit=1.5',
    '/products?limit=1&limit=2',
    '/products?extra=true',
    '/stock-low?search=x',
    '/history?limit=51',
    '/history?cursor=malformed',
    '/products?cursor=malformed',
    '/products/by-barcode',
    '/products/by-barcode?code=x&code=y',
    '/dashboard?extra=true',
    `/products/${own}?extra=true`,
  ])
    await t.test(`strict read query ${suffix}`, async () => {
      assert.equal((await get(suffix)).statusCode, 400);
    });
  await t.test(
    'URL integer limits are validated at read boundary while body coercion remains disabled',
    async () => {
      assert.equal((await get('/products?limit=100')).statusCode, 200);
      assert.equal((await get('/history?limit=50')).statusCode, 200);
      assert.equal(
        (
          await get('/products?search=READ_PRODUCT_PRIVATE_CANARY_Q7X9K2')
        ).json().items.length,
        1,
      );
    },
  );
  for (const status of ['disabled', 'DELETING'])
    await t.test(`every read refuses business ${status}`, async () => {
      await f.pool.query(
        status === 'disabled'
          ? 'UPDATE businesses SET cloud_access_enabled=false WHERE id=$1'
          : "UPDATE businesses SET status='DELETING' WHERE id=$1",
        [a.businessId],
      );
      for (const suffix of routes)
        assert.equal((await get(suffix)).statusCode, 403);
      await f.pool.query(
        "UPDATE businesses SET status='ACTIVE',cloud_access_enabled=true WHERE id=$1",
        [a.businessId],
      );
    });
  await t.test(
    'verification required and hostile/null Origin blocked on reads',
    async () => {
      await f.pool.query('UPDATE "user" SET email_verified=false WHERE id=$1', [
        a.userId,
      ]);
      assert.equal((await get('/products')).statusCode, 403);
      await f.pool.query('UPDATE "user" SET email_verified=true WHERE id=$1', [
        a.userId,
      ]);
      for (const origin of ['null', 'https://evil.example.test'])
        assert.equal((await get('/products', a, { origin })).statusCode, 403);
    },
  );
  await t.test(
    'read canary has no foreign barcode/search/detail leakage',
    async () => {
      const response = await get(
        '/products?search=READ_PRODUCT_PRIVATE_CANARY_Q7X9K2',
        b,
      );
      assert.equal(response.statusCode, 200);
      assert.deepEqual(
        response
          .json()
          .items.map((v: { product: { id: string } }) => v.product.id),
        [foreign],
      );
      assert.equal((await get(`/products/${own}`, b)).statusCode, 404);
    },
  );
  await t.test('foreign cursor and cross-filter cursor reject400', async () => {
    const second = createCommand({ name: 'Second' });
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: `/v1/inventories/${a.inventoryId}/products`,
          payload: second,
          headers: {
            cookie: a.cookie,
            'x-csrf-token': a.csrf,
            'idempotency-key': second.operationId,
          },
        })
      ).statusCode,
      200,
    );
    const cursor = (await get('/products?limit=1')).json().nextCursor;
    assert.ok(cursor);
    assert.equal(
      (await get('/products?cursor=' + encodeURIComponent(cursor), b))
        .statusCode,
      400,
    );
    assert.equal(
      (
        await get(
          '/products?search=changed&cursor=' + encodeURIComponent(cursor),
        )
      ).statusCode,
      400,
    );
  });
  await t.test(
    'archived Product/barcode404 while active Product with missing State gives sanitized500',
    async () => {
      await f.pool.query('UPDATE products SET is_archived=true WHERE id=$1', [
        own,
      ]);
      assert.equal((await get(`/products/${own}`)).statusCode, 404);
      assert.equal(
        (await get('/products/by-barcode?code=001234')).statusCode,
        404,
      );
      await f.pool.query('UPDATE products SET is_archived=false WHERE id=$1', [
        own,
      ]);
      await f.pool.query('DELETE FROM inventory_states WHERE product_id=$1', [
        own,
      ]);
      assert.equal((await get(`/products/${own}`)).statusCode, 500);
      await f.pool.query(
        'INSERT INTO inventory_states(inventory_id,product_id,stock,unit_cost_units,last_movement_id) SELECT inventory_id,id,20,10000000,(SELECT id FROM inventory_movements WHERE product_id=$1 LIMIT 1) FROM products WHERE id=$1',
        [own],
      );
    },
  );
  await t.test(
    'legacy UUIDv4 Inventory and Product paths retain identities',
    async () => {
      const scope = await owner('legacy'),
        inventoryId = '550e8400-e29b-41d4-a716-446655440011',
        productId = '550e8400-e29b-41d4-a716-446655440012';
      await f.pool.query('UPDATE inventories SET id=$1 WHERE id=$2', [
        inventoryId,
        scope.inventoryId,
      ]);
      scope.inventoryId = inventoryId;
      await f.pool.query(
        "INSERT INTO products(id,inventory_id,name,regular_sale_price_units,created_at,updated_at)VALUES($1,$2,'Legacy',15000000,100,100)",
        [productId, inventoryId],
      );
      await f.pool.query(
        'INSERT INTO inventory_states(inventory_id,product_id,stock,unit_cost_units)VALUES($1,$2,0,NULL)',
        [inventoryId, productId],
      );
      const response = await get('/products/' + productId.toUpperCase(), scope);
      assert.equal(response.statusCode, 200);
      assert.equal(response.json().product.id, productId);
      assert.equal(response.json().state.inventoryId, inventoryId);
    },
  );
  await t.test('read bucket has durable120/121 with Retry-After', async () => {
    now += 60001;
    for (let i = 0; i < 120; i++)
      assert.equal((await get('/products')).statusCode, 200);
    const limited = await get('/products');
    assert.equal(limited.statusCode, 429);
    assert.ok(limited.headers['retry-after']);
  });
  assert.equal(
    (
      await f.pool.query('SELECT revision FROM inventories WHERE id=$1', [
        a.inventoryId,
      ])
    ).rows[0].revision,
    (BigInt(before) + 1n).toString(),
  );
  assert.equal(
    BigInt(
      (await f.pool.query('SELECT count(*) FROM operation_receipts')).rows[0]
        .count,
    ),
    BigInt(receipts) + 1n,
  );
  assert.doesNotMatch(
    f.logs.join(''),
    /READ_PRODUCT_PRIVATE_CANARY_Q7X9K2|"(?:body|payload|unitCost|estimatedProfit)"\s*:/,
  );
});
