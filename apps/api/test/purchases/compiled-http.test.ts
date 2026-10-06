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
  registerPurchaseResultSchema,
  type RegisterPurchaseCommandResult,
} from '@stock-app/contracts';
import { disposableDatabase, id } from '../postgres/helpers.js';
import {
  migrateDatabase,
  migrationsFolder,
} from '../../src/infrastructure/postgres/migrate.js';
import { localSmtp } from '../helpers/smtp.js';
import { createCommand, updateCommand } from '../products/helpers.js';
import { saleCommand } from '../sales/helpers.js';
import { purchaseCommand } from './helpers.js';
import { businesses } from '../../src/infrastructure/postgres/schema.js';

function freshFetch(url: string, options: Parameters<typeof fetch>[1] = {}) {
  // Restart smoke uses new HTTP connections, not an Undici keep-alive socket closed by the old server.
  const headers = new Headers(options.headers);
  headers.set('connection', 'close');
  return fetch(url, { ...options, headers });
}

test('compiled Purchase HTTP with PostgreSQL/auth/SMTP proves exact average, immutable Product snapshot and lost ACK replay', async (t) => {
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
  const purchasesModule: typeof import('../../src/purchases/routes.js') =
    await import(
      new URL('../../dist/purchases/routes.js', import.meta.url).href
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
        BETTER_AUTH_SECRET: 'fictional-api04-compiled-smoke-secret',
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
    purchasesModule.registerPurchaseRoutes(
      current,
      runtime.auth,
      runtime.database,
    );
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
    const email = `compiled-purchase-${letter}@example.test`,
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
    method: 'POST' | 'PATCH' = 'POST',
  ) {
    return freshFetch(baseURL + path, {
      method,
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

  function assertResult(
    value: unknown,
  ): asserts value is RegisterPurchaseCommandResult {
    createSchemaValidator(registerPurchaseResultSchema)(value);
  }
  const product = createCommand({
      initialStock: 20,
      initialUnitCost: '10000000',
      initialMovementId: id(),
      regularSalePrice: '15000000',
    }),
    productsPath = '/v1/inventories/' + a.context.inventory.id + '/products',
    purchasesPath = '/v1/inventories/' + a.context.inventory.id + '/purchases',
    salesPath = '/v1/inventories/' + a.context.inventory.id + '/sales';
  const created = await send(productsPath, product);
  assert.equal(created.status, 200);
  createSchemaValidator(createProductResultSchema)(await created.json());
  const command = purchaseCommand(product.payload.productId, 10, '12000000', {
    expectedStateRevision: '0',
    expectedState: {
      stock: 20,
      unitCost: '10000000',
      lastMovementId: product.payload.initialMovementId,
    },
  });
  const accepted = await send(purchasesPath, command);
  assert.equal(accepted.status, 200);
  const original: unknown = await accepted.json();
  assertResult(original);
  assert.equal(original.purchase.averageCostBefore, '10000000');
  assert.equal(original.purchase.averageCostAfter, '10666667');
  assert.equal(original.afterState.stock, 30);
  assert.equal(original.afterState.unitCost, '10666667');
  assert.equal(original.afterState.stateRevision, '1');
  assert.equal(original.movement.unitCostSnapshot, '12000000');
  assert.equal(original.priceAnalysis.regularSalePrice, '15000000');
  assert.equal(original.priceAnalysis.costChanged, true);
  assert.ok(original.priceAnalysis.suggestedSalePrice);
  const operation = await freshFetch(
    baseURL +
      '/v1/inventories/' +
      a.context.inventory.id +
      '/operations/' +
      command.operationId,
    { headers: { cookie: a.cookie } },
  );
  assert.equal(operation.status, 200);
  createSchemaValidator(operationReceiptSchema)(await operation.json());
  const replay = await send(purchasesPath, command);
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), original);
  const update = updateCommand(product.payload.productId, '0', {
    regularSalePrice: '20000000',
  });
  assert.equal(
    (
      await send(
        productsPath + '/' + product.payload.productId,
        update,
        a,
        'PATCH',
      )
    ).status,
    200,
  );
  const afterUpdate = await send(purchasesPath, command);
  assert.equal(afterUpdate.status, 200);
  assert.deepEqual(await afterUpdate.json(), original);
  assert.equal(
    (await pool.query('SELECT regular_sale_price_units FROM products')).rows[0]
      .regular_sale_price_units,
    '20000000',
  );
  const stale = purchaseCommand(product.payload.productId, 1, '12000000', {
    expectedStateRevision: original.afterState.stateRevision,
    expectedState: {
      stock: original.afterState.stock,
      unitCost: original.afterState.unitCost,
      lastMovementId: original.afterState.lastMovementId,
    },
  });
  const sale = saleCommand([
    {
      productId: product.payload.productId,
      quantity: 1,
      price: '15000000',
      cost: '10666667',
      estimatedCost: '10666667',
      estimatedProfit: '4333333',
    },
  ]);
  const sold = await send(salesPath, sale);
  assert.equal(sold.status, 200);
  createSchemaValidator(registerSaleResultSchema)(await sold.json());
  const conflict = await send(purchasesPath, stale);
  assert.equal(conflict.status, 409);
  const conflictBody = await conflict.json();
  assert.ok(
    conflictBody &&
      typeof conflictBody === 'object' &&
      'error' in conflictBody &&
      conflictBody.error &&
      typeof conflictBody.error === 'object' &&
      'code' in conflictBody.error &&
      'details' in conflictBody.error,
  );
  assert.equal(conflictBody.error.code, 'REVISION_CONFLICT');
  assert.deepEqual(conflictBody.error.details, { currentRevision: '2' });
  const next = purchaseCommand(product.payload.productId, 1, '14000000', {
    expectedStateRevision: '2',
    expectedState: {
      stock: 29,
      unitCost: '10666667',
      lastMovementId: sale.payload.items[0].movementId,
    },
  });
  assert.equal((await send(purchasesPath, next)).status, 200);
  const foreign = await send(
    '/v1/inventories/' + b.context.inventory.id + '/purchases',
    purchaseCommand(product.payload.productId),
    b,
  );
  assert.equal(foreign.status, 404);
  assert.doesNotMatch(await foreign.text(), /Fictional|10000000|stock|barcode/);
  await first.current.close();
  const second = start();
  await second.current.listen({ host: '127.0.0.1', port: address.port });
  // Lost ACK retry preserves Product15 and original stock/cost while canonical Product20/State changed.
  const restarted = await send(purchasesPath, command);
  assert.equal(restarted.status, 200);
  assert.deepEqual(await restarted.json(), original);
  assert.equal(
    (await pool.query('SELECT count(*) FROM purchases')).rows[0].count,
    '2',
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*) FROM inventory_movements WHERE type='PURCHASE'",
      )
    ).rows[0].count,
    '2',
  );
  assert.equal(
    (await pool.query('SELECT stock,state_revision FROM inventory_states'))
      .rows[0].stock,
    '30',
  );
  assert.equal(
    (
      await pool.query('SELECT revision FROM inventories WHERE id=$1', [
        a.context.inventory.id,
      ])
    ).rows[0].revision,
    '5',
  );
  assert.equal((await freshFetch(baseURL + '/live')).status, 200);
  assert.equal((await freshFetch(baseURL + '/health')).status, 404);
  await second.current.close();
});
