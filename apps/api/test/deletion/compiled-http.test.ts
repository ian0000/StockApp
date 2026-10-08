import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contractSchemas, createSchemaValidator } from '@stock-app/contracts';
import { disposableDatabase, id } from '../postgres/helpers.js';
import { migrateDatabase } from '../../src/infrastructure/postgres/migrate.js';
import { localSmtp } from '../helpers/smtp.js';
import { createCommand } from '../products/helpers.js';

function freshFetch(url: string, options: Parameters<typeof fetch>[1] = {}) {
  const headers = new Headers(options.headers);
  headers.set('connection', 'close');
  return fetch(url, { ...options, headers });
}
test('compiled HTTP/SMTP real deletion survives runtime restart, official recovery, runner startup and private CLI export', async (t) => {
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
  const deletionModule: typeof import('../../src/deletion/routes.js') =
    await import(
      new URL('../../dist/deletion/routes.js', import.meta.url).href
    );
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
  const env = {
    DATABASE_URL: pool.options.connectionString,
    AUTH_BASE_URL: baseURL,
    APP_ORIGIN: 'http://localhost:5173',
    BETTER_AUTH_SECRET: 'fictional-api10-compiled-auth-key-only',
    DELETION_SUPPRESSION_SECRET: 'fictional-api10-compiled-suppression-key',
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: String(smtp.port),
    SMTP_SECURITY: 'local',
    SMTP_FROM: 'auth@example.test',
  };
  function start() {
    const current = appModule.buildApp(),
      runtime = runtimeModule.createAuthRuntime(
        env,
        () => assert.fail('SMTP failure'),
        () => assert.fail('Deletion runner failure'),
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
    // Delay activation explicitly to test restart before any worker processes the durable request.
    deletionModule.registerDeletionRoutes(
      current,
      runtime.auth,
      runtime.database,
      runtime.suppressionSecret,
    );
    app = current;
    return { current, runtime };
  }
  const first = start();
  await first.current.listen({ host: '127.0.0.1', port: address.port });
  const post = (path: string, body: unknown) =>
    freshFetch(`${baseURL}/api/auth/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: env.APP_ORIGIN },
      body: JSON.stringify(body),
    });
  const email = 'api10-compiled@example.test',
    password = 'fictional-api10-password-only';
  assert.equal(
    (
      await post('sign-up/email', {
        email,
        password,
        name: 'Fictional deletion',
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
  const login = async () => {
    const result = await post('sign-in/email', { email, password });
    assert.equal(result.status, 200);
    return result.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
  };
  const csrf = async (cookie: string) => {
    const result = await freshFetch(`${baseURL}/v1/session/csrf`, {
      headers: { cookie },
    });
    assert.equal(result.status, 200);
    const body: unknown = await result.json();
    assert.ok(
      body &&
        typeof body === 'object' &&
        'token' in body &&
        typeof body.token === 'string',
    );
    return body.token;
  };
  const cookie = await login(),
    token = await csrf(cookie);
  const bootstrap = await freshFetch(`${baseURL}/v1/business`, {
    method: 'POST',
    headers: {
      cookie,
      'x-csrf-token': token,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      inventoryName: 'Compiled deletion dataset',
      currency: 'USD',
      reportingTimeZone: 'UTC',
    }),
  });
  assert.equal(bootstrap.status, 201);
  const dataset = contractSchemas.BootstrapResponse;
  createSchemaValidator(dataset)(await bootstrap.json());
  const inventoryId = (await pool.query('SELECT id FROM inventories')).rows[0]
    .id as string;
  await pool.query('UPDATE businesses SET cloud_access_enabled=true');
  const product = createCommand({
    initialStock: 2,
    initialUnitCost: '1000000',
    initialMovementId: id(),
  });
  assert.equal(
    (
      await freshFetch(`${baseURL}/v1/inventories/${inventoryId}/products`, {
        method: 'POST',
        headers: {
          cookie,
          'x-csrf-token': token,
          'content-type': 'application/json',
          'idempotency-key': product.operationId,
        },
        body: JSON.stringify(product),
      })
    ).status,
    200,
  );
  const key = id();
  const deletion = (currentCookie: string, currentToken: string) =>
    freshFetch(`${baseURL}/v1/me/deletion`, {
      method: 'POST',
      headers: {
        cookie: currentCookie,
        'x-csrf-token': currentToken,
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      body: '{}',
    });
  const accepted = await deletion(cookie, token);
  assert.equal(accepted.status, 202);
  const original: unknown = await accepted.json();
  createSchemaValidator(contractSchemas.AccountDeletionResult)(original);
  assert.equal((await deletion(cookie, token)).status, 401);
  await first.current.close();
  const second = start();
  await second.current.listen({ host: '127.0.0.1', port: address.port });
  const recoveryCookie = await login(),
    recoveryToken = await csrf(recoveryCookie);
  const replay = await deletion(recoveryCookie, recoveryToken);
  assert.equal(replay.status, 202);
  assert.deepEqual(await replay.json(), original);
  second.runtime.deletionRunner.start();
  await second.runtime.deletionRunner.sweep();
  assert.equal((await pool.query('SELECT id FROM "user"')).rowCount, 0);
  assert.equal((await pool.query('SELECT id FROM inventories')).rowCount, 0);
  assert.equal(
    (await pool.query('SELECT operation_id FROM operation_receipts')).rowCount,
    0,
  );
  assert.equal(
    (await pool.query('SELECT status FROM deletion_requests')).rows[0].status,
    'COMPLETED',
  );
  const folder = await mkdtemp(join(tmpdir(), 'stockapp-api10-registry-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const output = join(folder, 'suppressions.json');
  const cli = new URL('../../dist/deletion/registry-cli.js', import.meta.url);
  const exported = await promisify(execFile)(
    process.execPath,
    [fileURLToPath(cli), 'export', '--output', output],
    { windowsHide: true, env: { ...process.env, ...env } },
  );
  assert.match(exported.stdout, /Suppression maintenance complete/);
  const registry: unknown = JSON.parse(await readFile(output, 'utf8'));
  assert.ok(
    registry &&
      typeof registry === 'object' &&
      'identifiers' in registry &&
      Array.isArray(registry.identifiers) &&
      registry.identifiers.length === 1,
  );
  const applied = await promisify(execFile)(
    process.execPath,
    [fileURLToPath(cli), 'apply', '--input', output],
    { windowsHide: true, env: { ...process.env, ...env } },
  );
  assert.match(applied.stdout, /Suppression maintenance complete/);
  assert.doesNotMatch(
    exported.stdout + applied.stdout,
    /api10-compiled@example|fictional-api10/,
  );
});
