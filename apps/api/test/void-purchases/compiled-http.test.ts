import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { eq } from 'drizzle-orm';
import {
  createSchemaValidator,
  operationReceiptSchema,
  createProductResultSchema,
  voidPurchaseResultSchema,
  registerPurchaseResultSchema,
  type VoidPurchaseCommandResult,
} from '@stock-app/contracts';
import { disposableDatabase, id } from '../postgres/helpers.js';
import {
  migrateDatabase,
  migrationsFolder,
} from '../../src/infrastructure/postgres/migrate.js';
import { localSmtp } from '../helpers/smtp.js';
import { createCommand, updateCommand } from '../products/helpers.js';
import { purchaseCommand } from '../purchases/helpers.js';
import { voidPurchaseCommand } from './helpers.js';
import { businesses } from '../../src/infrastructure/postgres/schema.js';

function freshFetch(url: string, options: Parameters<typeof fetch>[1] = {}) {
  // Restart smoke uses new HTTP connections, not an Undici keep-alive socket closed by the old server.
  const headers = new Headers(options.headers);
  headers.set('connection', 'close');
  return fetch(url, { ...options, headers });
}

test('compiled VoidPurchase HTTP with PostgreSQL/auth/SMTP proves exact state and lost ACK replay', async (t) => {
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
        BETTER_AUTH_SECRET: 'fictional-api07-compiled-smoke-secret',
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

  function assertResult(
    value: unknown,
  ): asserts value is VoidPurchaseCommandResult {
    createSchemaValidator(voidPurchaseResultSchema)(value);
  }
  const product = createCommand({
      initialStock: 20,
      initialUnitCost: '10000000',
      initialMovementId: id(),
      regularSalePrice: '15000000',
    }),
    prefix = '/v1/inventories/' + a.context.inventory.id,
    productsPath = prefix + '/products';
  const created = await send(productsPath, product);
  assert.equal(created.status, 200);
  createSchemaValidator(createProductResultSchema)(await created.json());
  const firstPurchase = purchaseCommand(
    product.payload.productId,
    10,
    '12000000',
    {
      expectedStateRevision: '0',
      expectedState: {
        stock: 20,
        unitCost: '10000000',
        lastMovementId: product.payload.initialMovementId,
      },
    },
  );
  firstPurchase.occurredAt = 900;
  firstPurchase.payload.createdAt = 1000;
  const purchasedFirst = await send(prefix + '/purchases', firstPurchase);
  assert.equal(purchasedFirst.status, 200);
  createSchemaValidator(registerPurchaseResultSchema)(
    await purchasedFirst.json(),
  );
  const command = voidPurchaseCommand(firstPurchase.payload.purchaseId, {
      expectedStateRevision: '1',
      expectedState: {
        stock: 30,
        unitCost: '10666667',
        lastMovementId: firstPurchase.payload.movementId,
      },
    }),
    voidPath =
      prefix + '/purchases/' + firstPurchase.payload.purchaseId + '/void';
  const accepted = await send(voidPath, command);
  assert.equal(accepted.status, 200);
  const original: unknown = await accepted.json();
  assertResult(original);
  assert.equal(original.kind, 'VOIDED');
  assert.equal(original.purchase.status, 'VOIDED');
  assert.ok(original.purchase.updatedAt > 1600);
  assert.equal(original.purchase.createdAt, 1000);
  assert.equal(original.states[0].stock, 20);
  assert.equal(original.states[0].unitCost, '10000000');
  assert.equal(original.states[0].stateRevision, '2');
  assert.equal(
    original.reversals[0].reversalOfMovementId,
    firstPurchase.payload.movementId,
  );
  assert.equal(original.reversals[0].unitCostSnapshot, '12000000');
  assert.equal(original.reversals[0].effectiveAt, 1500);
  assert.equal(original.reversals[0].createdAt, 1600);
  const operation = await freshFetch(
    baseURL + prefix + '/operations/' + command.operationId,
    { headers: { cookie: a.cookie } },
  );
  assert.equal(operation.status, 200);
  createSchemaValidator(operationReceiptSchema)(await operation.json());
  const replay = await send(voidPath, command);
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), original);
  const stale = {
      ...command,
      operationId: id(),
      payload: {
        ...command.payload,
        reversalMovementId: id(),
      },
    },
    conflict = await send(voidPath, stale);
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
  assert.equal(conflictBody.error.code, 'REVISION_CONFLICT');
  assert.equal((await send(voidPath, stale)).status, 409);
  const currentEvidence = {
      expectedStateRevision: '2',
      expectedState: {
        stock: 20,
        unitCost: '10000000',
        lastMovementId: original.reversals[0].id,
      },
    },
    current = voidPurchaseCommand(
      firstPurchase.payload.purchaseId,
      currentEvidence,
    );
  const rejected = await send(voidPath, current);
  assert.equal(rejected.status, 422);
  const rejectedBody: unknown = await rejected.json();
  assert.ok(
    rejectedBody &&
      typeof rejectedBody === 'object' &&
      'error' in rejectedBody &&
      rejectedBody.error &&
      typeof rejectedBody.error === 'object' &&
      'code' in rejectedBody.error,
  );
  assert.equal(rejectedBody.error.code, 'VOID_NOT_ELIGIBLE');
  const purchase = purchaseCommand(
    product.payload.productId,
    1,
    '12000000',
    currentEvidence,
  );
  purchase.occurredAt = 2100;
  purchase.payload.createdAt = 2200;
  const purchased = await send(prefix + '/purchases', purchase);
  assert.equal(purchased.status, 200);
  createSchemaValidator(registerPurchaseResultSchema)(await purchased.json());
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
  const foreign = await send(
    '/v1/inventories/' +
      b.context.inventory.id +
      '/purchases/' +
      firstPurchase.payload.purchaseId +
      '/void',
    { ...command, operationId: id() },
    b,
  );
  assert.equal(foreign.status, 404);
  assert.doesNotMatch(await foreign.text(), /Fictional|10000000|stock|barcode/);
  await first.current.close();
  const second = start();
  await second.current.listen({ host: '127.0.0.1', port: address.port });
  const restarted = await send(voidPath, command);
  assert.equal(restarted.status, 200);
  assert.deepEqual(await restarted.json(), original);
  assert.equal(
    (
      await pool.query(
        "SELECT count(*) FROM inventory_movements WHERE type='REVERSAL'",
      )
    ).rows[0].count,
    '1',
  );
  assert.equal(
    (await pool.query('SELECT stock,state_revision FROM inventory_states'))
      .rows[0].stock,
    '21',
  );
  assert.equal(
    (await pool.query('SELECT state_revision FROM inventory_states')).rows[0]
      .state_revision,
    '3',
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
  assert.equal(
    (
      await freshFetch(
        baseURL + prefix + '/purchases/' + firstPurchase.payload.purchaseId,
        {
          headers: { cookie: a.cookie },
        },
      )
    ).status,
    404,
  );
  await second.current.close();
});
