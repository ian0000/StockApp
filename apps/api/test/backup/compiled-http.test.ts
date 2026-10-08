import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { contractSchemas, createSchemaValidator } from '@stock-app/contracts';
import { parseBackupV1 } from '@stock-app/application';
import { disposableDatabase } from '../postgres/helpers.js';
import { migrateDatabase } from '../../src/infrastructure/postgres/migrate.js';
import { localSmtp } from '../helpers/smtp.js';
import {
  createCommand,
  updateCommand,
  archiveCommand,
} from '../products/helpers.js';

function freshFetch(url: string, options: Parameters<typeof fetch>[1] = {}) {
  const headers = new Headers(options.headers);
  headers.set('connection', 'close');
  return fetch(url, { ...options, headers });
}
test('compiled BackupV1/account export with PostgreSQL, official auth and SMTP preserve canonical artifact and privacy across restart', async (t) => {
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
  const productModule: typeof import('../../src/products/routes.js') =
    await import(
      new URL('../../dist/products/routes.js', import.meta.url).href
    );
  const backupModule: typeof import('../../src/backup/routes.js') =
    await import(new URL('../../dist/backup/routes.js', import.meta.url).href);
  let app: ReturnType<typeof appModule.buildApp> | undefined;
  t.after(async () => {
    await app?.close();
  });
  const pool = await disposableDatabase(t);
  await migrateDatabase(pool);
  const smtp = await localSmtp(t),
    probe = appModule.buildApp();
  await probe.listen({ host: '127.0.0.1', port: 0 });
  const address = probe.server.address();
  assert.ok(address && typeof address !== 'string');
  await probe.close();
  const baseURL = `http://127.0.0.1:${address.port}`;
  let now = Date.now();
  function start() {
    const current = appModule.buildApp(),
      runtime = runtimeModule.createAuthRuntime(
        {
          DATABASE_URL: pool.options.connectionString,
          AUTH_BASE_URL: baseURL,
          APP_ORIGIN: 'http://localhost:5173',
          BETTER_AUTH_SECRET: 'fictional-api09-compiled-smoke-secret',
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
    productModule.registerProductRoutes(
      current,
      runtime.auth,
      runtime.database,
    );
    backupModule.registerBackupRoutes(
      current,
      runtime.auth,
      runtime.database,
      () => now,
    );
    app = current;
    return { current, runtime };
  }
  const first = start();
  await first.current.listen({ host: '127.0.0.1', port: address.port });
  const email = 'compiled-backup-private-q7x9@example.test',
    password = 'fictional-compiled-password';
  const post = (path: string, body: unknown, cookie?: string) =>
    freshFetch(`${baseURL}/api/auth/${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:5173',
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
      redirect: 'manual',
    });
  assert.equal(
    (await post('sign-up/email', { email, password, name: 'Fictional owner' }))
      .status,
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
  now = Date.now();
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
  const csrfToken = csrf.token;
  const bootstrap = await freshFetch(`${baseURL}/v1/business`, {
    method: 'POST',
    headers: {
      cookie,
      'x-csrf-token': csrfToken,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      inventoryName: 'COMPILED_BACKUP_PRIVATE_Q7X9',
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
  const inventoryId = dataset.inventory.id;
  await pool.query('UPDATE businesses SET cloud_access_enabled=true');
  const created = createCommand({ name: 'COMPILED_PRODUCT_PRIVATE_Q7X9' });
  const commandRequest = (
    command:
      | typeof created
      | ReturnType<typeof updateCommand>
      | ReturnType<typeof archiveCommand>,
  ) =>
    freshFetch(
      `${baseURL}/v1/inventories/${inventoryId}/products${command.commandKind === 'PRODUCT_CREATE' ? '' : `/${created.payload.productId}${command.commandKind === 'PRODUCT_ARCHIVE' ? '/archive' : ''}`}`,
      {
        method: command.commandKind === 'PRODUCT_UPDATE' ? 'PATCH' : 'POST',
        headers: {
          cookie,
          'x-csrf-token': csrfToken,
          'content-type': 'application/json',
          'idempotency-key': command.operationId,
        },
        body: JSON.stringify(command),
      },
    );
  assert.equal((await commandRequest(created)).status, 200);
  const update = updateCommand(created.payload.productId, '0');
  assert.equal((await commandRequest(update)).status, 200);
  const archive = archiveCommand(created.payload.productId, '1');
  assert.equal((await commandRequest(archive)).status, 200);
  assert.equal((await commandRequest(archive)).status, 200);
  const path = `${baseURL}/v1/inventories/${inventoryId}/backup`;
  assert.equal((await freshFetch(path)).status, 401);
  const download = await freshFetch(path, { headers: { cookie } });
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('cache-control'), 'private, no-store');
  assert.ok(download.headers.get('x-request-id'));
  assert.match(
    download.headers.get('content-disposition') ?? '',
    /^attachment; filename="stockapp-backup-.*\.json"$/,
  );
  const original = await download.text(),
    backup = parseBackupV1(original);
  createSchemaValidator(contractSchemas.BackupV1)(JSON.parse(original));
  assert.equal(backup.data.products[0].isArchived, true);
  const account = await freshFetch(`${baseURL}/v1/me/export`, {
    headers: { cookie },
  });
  assert.equal(account.status, 200);
  const accountBody: unknown = await account.json();
  createSchemaValidator(contractSchemas.AccountExport)(accountBody);
  assert.ok(
    accountBody && typeof accountBody === 'object' && 'backup' in accountBody,
  );
  assert.deepEqual(accountBody.backup, JSON.parse(original));
  await first.current.close();
  const second = start();
  await second.current.listen({ host: '127.0.0.1', port: address.port });
  const restarted = await freshFetch(path, { headers: { cookie } });
  assert.equal(restarted.status, 200);
  assert.equal(await restarted.text(), original);
  assert.equal((await commandRequest(archive)).status, 200);
  assert.equal(
    (await freshFetch(`${baseURL}/v1/me/export`, { headers: { cookie } }))
      .status,
    200,
  );
  assert.equal((await freshFetch(`${baseURL}/health`)).status, 404);
});
