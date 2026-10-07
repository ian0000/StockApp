import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { eq } from 'drizzle-orm';
import {
  createSchemaValidator,
  createProductResultSchema,
  registerPurchaseResultSchema,
  registerSaleResultSchema,
  contractSchemas,
} from '@stock-app/contracts';
import { disposableDatabase, id } from '../postgres/helpers.js';
import {
  migrateDatabase,
  migrationsFolder,
} from '../../src/infrastructure/postgres/migrate.js';
import { localSmtp } from '../helpers/smtp.js';
import {
  createCommand,
  updateCommand,
  archiveCommand,
} from '../products/helpers.js';
import { purchaseCommand } from '../purchases/helpers.js';
import { voidPurchaseCommand } from '../void-purchases/helpers.js';
import { saleCommand } from '../sales/helpers.js';
import { voidCommand } from '../void-sales/helpers.js';
import { businesses } from '../../src/infrastructure/postgres/schema.js';

function freshFetch(url: string, options: Parameters<typeof fetch>[1] = {}) {
  // Restart smoke uses new HTTP connections, not an Undici keep-alive socket closed by the old server.
  const headers = new Headers(options.headers);
  headers.set('connection', 'close');
  return fetch(url, { ...options, headers });
}

test('compiled read models with PostgreSQL/auth/SMTP preserve enriched history and opaque cursors across restart', async (t) => {
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
  const purchasesModule: typeof import('../../src/purchases/routes.js') =
    await import(
      new URL('../../dist/purchases/routes.js', import.meta.url).href
    );
  const voidPurchasesModule: typeof import('../../src/void-purchases/routes.js') =
    await import(
      new URL('../../dist/void-purchases/routes.js', import.meta.url).href
    );
  const readsModule: typeof import('../../src/read-models/routes.js') =
    await import(
      new URL('../../dist/read-models/routes.js', import.meta.url).href
    );
  const salesModule: typeof import('../../src/sales/routes.js') = await import(
    new URL('../../dist/sales/routes.js', import.meta.url).href
  );
  const voidSalesModule: typeof import('../../src/void-sales/routes.js') =
    await import(
      new URL('../../dist/void-sales/routes.js', import.meta.url).href
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
        BETTER_AUTH_SECRET: 'fictional-api08-compiled-smoke-secret',
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
    purchasesModule.registerPurchaseRoutes(
      current,
      runtime.auth,
      runtime.database,
    );
    voidPurchasesModule.registerVoidPurchaseRoutes(
      current,
      runtime.auth,
      runtime.database,
    );
    salesModule.registerSaleRoutes(current, runtime.auth, runtime.database);
    voidSalesModule.registerVoidSaleRoutes(
      current,
      runtime.auth,
      runtime.database,
    );
    readsModule.registerReadRoutes(
      current,
      runtime.auth,
      runtime.database,
      runtime.config.secret,
      () => Date.parse('2026-05-01T12:00:00Z'),
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
    const email = `compiled-void-${letter}@example.test`,
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

  const product = createCommand({
    name: 'Original name',
    variant: 'Original variant',
    minimumStock: 25,
    initialStock: 20,
    initialUnitCost: '10000000',
    initialMovementId: id(),
    regularSalePrice: '15000000',
  });
  const prefix = '/v1/inventories/' + a.context.inventory.id,
    productsPath = prefix + '/products';
  const created = await send(productsPath, product);
  assert.equal(created.status, 200);
  createSchemaValidator(createProductResultSchema)(await created.json());
  const extra = createCommand({ name: 'Second' });
  assert.equal((await send(productsPath, extra)).status, 200);
  async function get(path: string, scope = a) {
    const response = await freshFetch(baseURL + path, {
      headers: { cookie: scope.cookie },
    });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.ok(response.headers.get('x-request-id'));
    return response;
  }
  const firstPage = await get(productsPath + '?limit=1');
  assert.equal(firstPage.status, 200);
  const page: unknown = await firstPage.json();
  createSchemaValidator(contractSchemas.ProductPage)(page);
  assert.ok(
    page &&
      typeof page === 'object' &&
      'nextCursor' in page &&
      typeof page.nextCursor === 'string',
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
  const purchased = await send(prefix + '/purchases', purchase);
  assert.equal(purchased.status, 200);
  createSchemaValidator(registerPurchaseResultSchema)(await purchased.json());
  const pv = voidPurchaseCommand(purchase.payload.purchaseId, {
    expectedStateRevision: '1',
    expectedState: {
      stock: 30,
      unitCost: '10666667',
      lastMovementId: purchase.payload.movementId,
    },
  });
  assert.equal(
    (
      await send(
        prefix + '/purchases/' + purchase.payload.purchaseId + '/void',
        pv,
      )
    ).status,
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
  sale.occurredAt = 1800;
  sale.payload.createdAt = 1900;
  const sold = await send(prefix + '/sales', sale);
  assert.equal(sold.status, 200);
  const financial = await sold.json();
  createSchemaValidator(registerSaleResultSchema)(financial);
  const financialValue: unknown = financial;
  assert.ok(
    financialValue &&
      typeof financialValue === 'object' &&
      'items' in financialValue &&
      Array.isArray(financialValue.items),
  );
  assert.equal('productName' in financialValue.items[0], false);
  const update = updateCommand(product.payload.productId, '0', {
    name: 'Current renamed name',
    variant: 'Current variant',
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
  const archive = archiveCommand(product.payload.productId, '1');
  assert.equal(
    (
      await send(
        productsPath + '/' + product.payload.productId + '/archive',
        archive,
      )
    ).status,
    200,
  );
  const sv = voidCommand(sale.payload.saleId, [
    {
      productId: product.payload.productId,
      expectedStateRevision: '3',
      expectedState: {
        stock: 18,
        unitCost: '10000000',
        lastMovementId: sale.payload.items[0].movementId,
      },
    },
  ]);
  sv.occurredAt = 2300;
  sv.payload.createdAt = 2400;
  assert.equal(
    (await send(prefix + '/sales/' + sale.payload.saleId + '/void', sv)).status,
    200,
  );
  const detailResponse = await get(prefix + '/sales/' + sale.payload.saleId);
  assert.equal(detailResponse.status, 200);
  const detail: unknown = await detailResponse.json();
  createSchemaValidator(contractSchemas.SaleDetail)(detail);
  assert.ok(
    detail &&
      typeof detail === 'object' &&
      'items' in detail &&
      Array.isArray(detail.items) &&
      'voidEligibility' in detail &&
      'sale' in detail,
  );
  assert.equal(detail.items[0].productName, 'Current renamed name');
  assert.equal(detail.items[0].productVariant, 'Current variant');
  assert.equal(detail.items[0].unitCostSnapshot, '10000000');
  assert.equal(detail.items[0].estimatedProfit, '10000000');
  assert.deepEqual(detail.voidEligibility, { eligible: false, reason: null });
  const purchaseRead = await get(
    prefix + '/purchases/' + purchase.payload.purchaseId,
  );
  assert.equal(purchaseRead.status, 200);
  const purchaseDetail: unknown = await purchaseRead.json();
  createSchemaValidator(contractSchemas.PurchaseDetail)(purchaseDetail);
  assert.ok(
    purchaseDetail &&
      typeof purchaseDetail === 'object' &&
      'voidEligibility' in purchaseDetail,
  );
  assert.deepEqual(purchaseDetail.voidEligibility, {
    eligible: false,
    reason: null,
  });
  assert.equal(
    (await get(productsPath + '/' + product.payload.productId)).status,
    404,
  );
  const historyResponse = await get(prefix + '/history');
  assert.equal(historyResponse.status, 200);
  const history: unknown = await historyResponse.json();
  createSchemaValidator(contractSchemas.HistoryPage)(history);
  assert.ok(
    history &&
      typeof history === 'object' &&
      'items' in history &&
      Array.isArray(history.items),
  );
  assert.deepEqual(
    history.items.map((v) => [v.type, v.status]),
    [
      ['SALE', 'VOIDED'],
      ['PURCHASE', 'VOIDED'],
    ],
  );
  const dashboard = await get(prefix + '/dashboard');
  assert.equal(dashboard.status, 200);
  createSchemaValidator(contractSchemas.Dashboard)(await dashboard.json());
  const foreign = await get(
    '/v1/inventories/' +
      b.context.inventory.id +
      '/sales/' +
      sale.payload.saleId,
    b,
  );
  assert.equal(foreign.status, 404);
  assert.doesNotMatch(
    await foreign.text(),
    /Current renamed|Current variant|10000000/,
  );
  const before = (
      await pool.query('SELECT revision FROM inventories WHERE id=$1', [
        a.context.inventory.id,
      ])
    ).rows[0].revision,
    receipts = (await pool.query('SELECT count(*) FROM operation_receipts'))
      .rows[0].count;
  await first.current.close();
  const second = start();
  await second.current.listen({ host: '127.0.0.1', port: address.port });
  const restarted = await get(prefix + '/sales/' + sale.payload.saleId);
  assert.equal(restarted.status, 200);
  assert.deepEqual(await restarted.json(), detail);
  const cursorResponse = await get(
    productsPath + '?cursor=' + encodeURIComponent(page.nextCursor),
  );
  assert.equal(cursorResponse.status, 200);
  createSchemaValidator(contractSchemas.ProductPage)(
    await cursorResponse.json(),
  );
  assert.equal(
    (
      await pool.query('SELECT revision FROM inventories WHERE id=$1', [
        a.context.inventory.id,
      ])
    ).rows[0].revision,
    before,
  );
  assert.equal(
    (await pool.query('SELECT count(*) FROM operation_receipts')).rows[0].count,
    receipts,
  );
  assert.equal((await freshFetch(baseURL + '/live')).status, 200);
  assert.equal((await freshFetch(baseURL + '/health')).status, 404);
  await second.current.close();
});
