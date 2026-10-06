import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { eq } from 'drizzle-orm';
import {
  createSchemaValidator,
  operationReceiptSchema,
  createProductResultSchema,
  registerSaleResultSchema,
} from '@stock-app/contracts';
import { disposableDatabase, id } from '../postgres/helpers.js';
import {
  migrateDatabase,
  migrationsFolder,
} from '../../src/infrastructure/postgres/migrate.js';
import { localSmtp } from '../helpers/smtp.js';
import { createCommand } from '../products/helpers.js';
import { saleCommand } from './helpers.js';
import { businesses } from '../../src/infrastructure/postgres/schema.js';

function freshFetch(url: string, options: Parameters<typeof fetch>[1] = {}) {
  // Restart smoke uses new HTTP connections, not an Undici keep-alive socket closed by the old server.
  const headers = new Headers(options.headers);
  headers.set('connection', 'close');
  return fetch(url, { ...options, headers });
}

test('compiled Sale HTTP with PostgreSQL/auth/SMTP preserves mixed snapshots and historical replay after stock/cost changes and restart', async (t) => {
  // Node resolves production exports without tsx/development conditions or TypeScript support.
  await promisify(execFile)(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      'await import(process.argv[1]);',
      new URL('../../dist/server.js', import.meta.url).href,
    ],
    { windowsHide: true, env: { ...process.env, NODE_OPTIONS: '' } },
  );
  const compiledMigrations: typeof import('../../src/infrastructure/postgres/migrate.js') =
    await import(
      new URL('../../dist/infrastructure/postgres/migrate.js', import.meta.url)
        .href
    );
  assert.equal(compiledMigrations.migrationsFolder, migrationsFolder);
  const appModule: typeof import('../../src/app.js') = await import(
    new URL('../../dist/app.js', import.meta.url).href
  );
  const authModule: typeof import('../../src/auth/routes.js') = await import(
    new URL('../../dist/auth/routes.js', import.meta.url).href
  );
  const runtimeModule: typeof import('../../src/auth/runtime.js') =
    await import(new URL('../../dist/auth/runtime.js', import.meta.url).href);
  const ownershipModule: typeof import('../../src/ownership/routes.js') =
    await import(
      new URL('../../dist/ownership/routes.js', import.meta.url).href
    );
  const contextModule: typeof import('../../src/ownership/context.js') =
    await import(
      new URL('../../dist/ownership/context.js', import.meta.url).href
    );
  const productsModule: typeof import('../../src/products/routes.js') =
    await import(
      new URL('../../dist/products/routes.js', import.meta.url).href
    );
  const salesModule: typeof import('../../src/sales/routes.js') = await import(
    new URL('../../dist/sales/routes.js', import.meta.url).href
  );
  let app: ReturnType<typeof appModule.buildApp> | undefined;
  // Close runtime-owned pools before the disposable database is dropped.
  t.after(async () => {
    await app?.close();
  });
  const pool = await disposableDatabase(t);
  await migrateDatabase(pool);
  const smtp = await localSmtp(t);
  const probe = appModule.buildApp();
  await probe.listen({ host: '127.0.0.1', port: 0 });
  const address = probe.server.address();
  assert.ok(address && typeof address !== 'string');
  await probe.close();
  const baseURL = `http://127.0.0.1:${address.port}`;
  function start() {
    const current = appModule.buildApp();
    const runtime = runtimeModule.createAuthRuntime(
      {
        DATABASE_URL: pool.options.connectionString,
        AUTH_BASE_URL: baseURL,
        APP_ORIGIN: 'http://localhost:5173',
        BETTER_AUTH_SECRET: 'fictional-api03-compiled-smoke-secret',
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: String(smtp.port),
        SMTP_SECURITY: 'local',
        SMTP_FROM: 'auth@example.test',
      },
      () => assert.fail('Local SMTP must succeed.'),
    );
    current.addHook('onClose', () => runtime.close());
    authModule.registerAuthRoutes(current, runtime.auth, runtime.config);
    ownershipModule.registerOwnershipRoutes(
      current,
      runtime.auth,
      runtime.database,
    );
    productsModule.registerProductRoutes(
      current,
      runtime.auth,
      runtime.database,
    );
    salesModule.registerSaleRoutes(current, runtime.auth, runtime.database);
    app = current;
    return { current, runtime };
  }
  const first = start();
  await first.current.listen({ host: '127.0.0.1', port: address.port });
  const post = (path: string, body: unknown) =>
    freshFetch(`${baseURL}/api/auth/${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:5173',
      },
      body: JSON.stringify(body),
      redirect: 'manual',
    });
  async function owner(letter: string) {
    const email = `compiled-sale-${letter}@example.test`,
      password = 'fictional-compiled-password';
    assert.equal(
      (
        await post('sign-up/email', {
          email,
          password,
          name: 'Fictional owner',
        })
      ).status,
      200,
    );
    await first.runtime.drainEmails();
    const message = smtp.messages
      .at(-1)
      ?.replace(/=\r?\n/g, '')
      .replace(/=([0-9A-F]{2})/gi, (_match, hex: string) =>
        String.fromCharCode(parseInt(hex, 16)),
      );
    const link = message?.match(/http:\/\/[^\s]+/)?.[0];
    assert.ok(link);
    assert.equal((await freshFetch(link, { redirect: 'manual' })).status, 302);
    const login = await post('sign-in/email', { email, password });
    assert.equal(login.status, 200);
    const cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    const authenticated = await contextModule.resolveAuthenticatedUser(
      first.runtime.auth,
      { cookie },
    );
    const csrfResponse = await freshFetch(`${baseURL}/v1/session/csrf`, {
      headers: { cookie },
    });
    const csrf: unknown = await csrfResponse.json();
    assert.ok(
      csrf &&
        typeof csrf === 'object' &&
        'token' in csrf &&
        typeof csrf.token === 'string',
    );
    const bootstrap = await freshFetch(`${baseURL}/v1/business`, {
      method: 'POST',
      headers: {
        cookie,
        'x-csrf-token': csrf.token,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        inventoryName: 'Fictional',
        currency: 'USD',
        reportingTimeZone: 'UTC',
      }),
    });
    assert.equal(bootstrap.status, 201);
    const dataset: unknown = await bootstrap.json();
    assert.ok(
      dataset &&
        typeof dataset === 'object' &&
        'inventory' in dataset &&
        dataset.inventory &&
        typeof dataset.inventory === 'object' &&
        'id' in dataset.inventory &&
        typeof dataset.inventory.id === 'string',
    );
    const own = await contextModule.resolveOwnDataset(
      first.runtime.database,
      authenticated.user.id,
    );
    assert.ok(own.business);
    await first.runtime.database
      .update(businesses)
      .set({ cloudAccessEnabled: true })
      .where(eq(businesses.id, own.business.id));
    return {
      cookie,
      csrf: csrf.token,
      context: await contextModule.resolveCloudInventory(
        first.runtime.database,
        authenticated,
        dataset.inventory.id,
      ),
    };
  }
  const a = await owner('a'),
    b = await owner('b');

  async function send(
    path: string,
    command: { operationId: string },
    scope = a,
  ) {
    return freshFetch(baseURL + path, {
      method: 'POST',
      headers: {
        cookie: scope.cookie,
        origin: 'http://localhost:5173',
        'x-csrf-token': scope.csrf,
        'content-type': 'application/json',
        'idempotency-key': command.operationId,
      },
      body: JSON.stringify(command),
    });
  }
  const productA = createCommand({
      initialStock: 10,
      initialUnitCost: '5000000',
      initialMovementId: id(),
    }),
    productB = createCommand();
  const productsPath =
      '/v1/inventories/' + a.context.inventory.id + '/products',
    salesPath = '/v1/inventories/' + a.context.inventory.id + '/sales';
  for (const command of [productA, productB]) {
    const response = await send(productsPath, command);
    assert.equal(response.status, 200);
    createSchemaValidator(createProductResultSchema)(await response.json());
  }
  const firstSale = saleCommand([
    {
      productId: productA.payload.productId,
      quantity: 2,
      price: '7000000',
      cost: '5000000',
      estimatedCost: '10000000',
      estimatedProfit: '4000000',
    },
    {
      productId: productB.payload.productId,
      quantity: 1,
      price: '7000000',
      cost: null,
      estimatedCost: null,
      estimatedProfit: null,
    },
  ]);
  const firstResponse = await send(salesPath, firstSale);
  assert.equal(firstResponse.status, 200);
  const original: unknown = await firstResponse.json();
  createSchemaValidator(registerSaleResultSchema)(original);
  assert.ok(
    original &&
      typeof original === 'object' &&
      'sale' in original &&
      original.sale &&
      typeof original.sale === 'object' &&
      'estimatedCost' in original.sale &&
      'estimatedProfit' in original.sale,
  );
  assert.equal(original.sale.estimatedCost, null);
  assert.equal(original.sale.estimatedProfit, null);
  const states = await pool.query(
    'SELECT product_id,stock FROM inventory_states WHERE inventory_id=$1',
    [a.context.inventory.id],
  );
  assert.equal(
    states.rows.find((r) => r.product_id === productA.payload.productId).stock,
    '8',
  );
  assert.equal(
    states.rows.find((r) => r.product_id === productB.payload.productId).stock,
    '-1',
  );
  const receipt = await freshFetch(
    baseURL +
      '/v1/inventories/' +
      a.context.inventory.id +
      '/operations/' +
      firstSale.operationId,
    { headers: { cookie: a.cookie } },
  );
  assert.equal(receipt.status, 200);
  createSchemaValidator(operationReceiptSchema)(await receipt.json());
  assert.deepEqual(await (await send(salesPath, firstSale)).json(), original);
  const nextSale = saleCommand([
    {
      productId: productA.payload.productId,
      quantity: 2,
      price: '7000000',
      cost: '5000000',
      estimatedCost: '10000000',
      estimatedProfit: '4000000',
    },
  ]);
  assert.equal((await send(salesPath, nextSale)).status, 200);
  await pool.query(
    'UPDATE inventory_states SET unit_cost_units=6000000,state_revision=state_revision+1 WHERE inventory_id=$1 AND product_id=$2',
    [a.context.inventory.id, productA.payload.productId],
  );
  const stale = saleCommand([
    {
      productId: productA.payload.productId,
      quantity: 1,
      price: '7000000',
      cost: '5000000',
      estimatedCost: '5000000',
      estimatedProfit: '2000000',
    },
  ]);
  const conflict = await send(salesPath, stale);
  assert.equal(conflict.status, 409);
  const conflictBody: unknown = await conflict.json();
  assert.ok(
    conflictBody &&
      typeof conflictBody === 'object' &&
      'error' in conflictBody &&
      conflictBody.error &&
      typeof conflictBody.error === 'object' &&
      'code' in conflictBody.error,
  );
  assert.equal(conflictBody.error.code, 'COST_SNAPSHOT_CONFLICT');
  const foreign = await send(
    '/v1/inventories/' + b.context.inventory.id + '/sales',
    saleCommand([
      {
        productId: productA.payload.productId,
        quantity: 1,
        price: '7000000',
        cost: '5000000',
        estimatedCost: '5000000',
        estimatedProfit: '2000000',
      },
    ]),
    b,
  );
  assert.equal(foreign.status, 404);
  assert.doesNotMatch(await foreign.text(), /Fictional|5000000|stock|barcode/);
  await first.current.close();
  const second = start();
  await second.current.listen({ host: '127.0.0.1', port: address.port });
  // Lost ACK recovery uses durable historical ChangeSet, even though current stock/cost changed.
  const replay = await send(salesPath, firstSale);
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), original);
  assert.equal(
    (await pool.query('SELECT count(*) FROM sales')).rows[0].count,
    '2',
  );
  assert.equal(
    (await pool.query('SELECT count(*) FROM sale_items')).rows[0].count,
    '3',
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*) FROM inventory_movements WHERE type='SALE'",
      )
    ).rows[0].count,
    '3',
  );
  assert.equal(
    (
      await pool.query('SELECT revision FROM inventories WHERE id=$1', [
        a.context.inventory.id,
      ])
    ).rows[0].revision,
    '4',
  );
  assert.equal(
    (
      await pool.query(
        'SELECT stock FROM inventory_states WHERE product_id=$1',
        [productA.payload.productId],
      )
    ).rows[0].stock,
    '6',
  );
  assert.equal((await freshFetch(baseURL + '/live')).status, 200);
  assert.equal((await freshFetch(baseURL + '/health')).status, 404);
  await second.current.close();
});
