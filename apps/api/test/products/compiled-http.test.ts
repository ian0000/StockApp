import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { eq } from 'drizzle-orm';
import {
  createSchemaValidator,
  operationReceiptSchema,
  createProductResultSchema,
  productMutationResultSchema,
} from '@stock-app/contracts';
import { disposableDatabase, id } from '../postgres/helpers.js';
import {
  migrateDatabase,
  migrationsFolder,
} from '../../src/infrastructure/postgres/migrate.js';
import { localSmtp } from '../helpers/smtp.js';
import { createCommand, updateCommand, archiveCommand } from './helpers.js';
import { businesses } from '../../src/infrastructure/postgres/schema.js';

function freshFetch(url: string, options: Parameters<typeof fetch>[1] = {}) {
  // Restart smoke uses new HTTP connections, not an Undici keep-alive socket closed by the old server.
  const headers = new Headers(options.headers);
  headers.set('connection', 'close');
  return fetch(url, { ...options, headers });
}

test('compiled Product HTTP flow with PostgreSQL/SMTP/auth performs create/update/conflict/archive, isolates B and replays lost ACK after restart', async (t) => {
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
        BETTER_AUTH_SECRET: 'fictional-api02-compiled-smoke-secret',
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
    const email = `compiled-product-${letter}@example.test`,
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

  async function commandRequest(
    command:
      | ReturnType<typeof createCommand>
      | ReturnType<typeof updateCommand>
      | ReturnType<typeof archiveCommand>,
    scope = a,
    urlInventory = scope.context.inventory.id,
  ) {
    const suffix =
      command.commandKind === 'PRODUCT_CREATE'
        ? ''
        : '/' +
          command.payload.productId +
          (command.commandKind === 'PRODUCT_ARCHIVE' ? '/archive' : '');
    return freshFetch(
      baseURL + '/v1/inventories/' + urlInventory + '/products' + suffix,
      {
        method: command.commandKind === 'PRODUCT_UPDATE' ? 'PATCH' : 'POST',
        headers: {
          cookie: scope.cookie,
          origin: 'http://localhost:5173',
          'x-csrf-token': scope.csrf,
          'content-type': 'application/json',
          'idempotency-key': command.operationId,
        },
        body: JSON.stringify(command),
      },
    );
  }
  const empty = createCommand({ barcode: '001' });
  const firstResponse = await commandRequest(empty);
  assert.equal(firstResponse.status, 200);
  const original: unknown = await firstResponse.json();
  createSchemaValidator(createProductResultSchema)(original);
  const receipt = await freshFetch(
    baseURL +
      '/v1/inventories/' +
      a.context.inventory.id +
      '/operations/' +
      empty.operationId,
    { headers: { cookie: a.cookie } },
  );
  assert.equal(receipt.status, 200);
  createSchemaValidator(operationReceiptSchema)(await receipt.json());
  const positive = createCommand({
    initialStock: 5,
    initialUnitCost: '0',
    initialMovementId: id(),
  });
  const positiveResponse = await commandRequest(positive);
  assert.equal(positiveResponse.status, 200);
  const initial: unknown = await positiveResponse.json();
  createSchemaValidator(createProductResultSchema)(initial);
  assert.ok(
    initial &&
      typeof initial === 'object' &&
      'state' in initial &&
      initial.state &&
      typeof initial.state === 'object' &&
      'lastMovementId' in initial.state,
  );
  assert.equal(
    initial.state.lastMovementId,
    positive.payload.initialMovementId,
  );
  const update = updateCommand(empty.payload.productId, '0', {
    barcode: '001',
  });
  const updated = await commandRequest(update);
  assert.equal(updated.status, 200);
  createSchemaValidator(productMutationResultSchema)(await updated.json());
  assert.equal(
    (await commandRequest(updateCommand(empty.payload.productId))).status,
    409,
  );
  const archive = archiveCommand(empty.payload.productId, '1');
  const archived = await commandRequest(archive);
  assert.equal(archived.status, 200);
  const archivedBody: unknown = await archived.json();
  createSchemaValidator(productMutationResultSchema)(archivedBody);
  assert.deepEqual(await (await commandRequest(archive)).json(), archivedBody);
  assert.equal(
    (await commandRequest(createCommand({ barcode: '001' }))).status,
    200,
  );
  const foreign = createCommand({ name: 'FOREIGN_COMPILED_CANARY' });
  assert.equal((await commandRequest(foreign, b)).status, 200);
  for (const command of [
    updateCommand(foreign.payload.productId),
    archiveCommand(foreign.payload.productId),
  ]) {
    const response = await commandRequest(command, a);
    assert.equal(response.status, 404);
    assert.doesNotMatch(
      await response.text(),
      /FOREIGN_COMPILED_CANARY|metadataRevision|barcode/,
    );
  }
  // Simulate losing the create ACK: discard the original runtime/pool and resend the stable command.
  await first.current.close();
  const second = start();
  await second.current.listen({ host: '127.0.0.1', port: address.port });
  const replay = await commandRequest(empty);
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), original);
  assert.deepEqual(await (await commandRequest(archive)).json(), archivedBody);
  assert.equal((await freshFetch(baseURL + '/live')).status, 200);
  assert.equal((await freshFetch(baseURL + '/health')).status, 404);
  assert.equal(
    (
      await pool.query('SELECT revision FROM inventories WHERE id=$1', [
        a.context.inventory.id,
      ])
    ).rows[0].revision,
    '5',
  );
  assert.equal(
    (
      await pool.query('SELECT count(*) FROM products WHERE inventory_id=$1', [
        a.context.inventory.id,
      ])
    ).rows[0].count,
    '3',
  );
  assert.equal(
    (
      await pool.query(
        'SELECT count(*) FROM inventory_movements WHERE inventory_id=$1',
        [a.context.inventory.id],
      )
    ).rows[0].count,
    '1',
  );
  await second.current.close();
});
