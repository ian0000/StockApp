import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eq } from 'drizzle-orm';
import {
  createSchemaValidator,
  operationReceiptSchema,
} from '@stock-app/contracts';
import { disposableDatabase } from '../postgres/helpers.js';
import { migrateDatabase } from '../../src/infrastructure/postgres/migrate.js';
import { localSmtp } from '../helpers/smtp.js';
import { purchaseCommand, emptyChanges } from '../helpers/commands.js';
import { businesses } from '../../src/infrastructure/postgres/schema.js';

function freshFetch(url: string, options: Parameters<typeof fetch>[1] = {}) {
  // Restart smoke uses new HTTP connections, not an Undici keep-alive socket closed by the old server.
  const headers = new Headers(options.headers);
  headers.set('connection', 'close');
  return fetch(url, { ...options, headers });
}

test('compiled API with real PostgreSQL/SMTP recovers the same durable receipt after HTTP runtime restart and isolates B', async (t) => {
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
  const engineModule: typeof import('../../src/infrastructure/postgres/command-executor.js') =
    await import(
      new URL(
        '../../dist/infrastructure/postgres/command-executor.js',
        import.meta.url,
      ).href
    );
  const fingerprintModule: typeof import('../../src/commands/fingerprint.js') =
    await import(
      new URL('../../dist/commands/fingerprint.js', import.meta.url).href
    );
  const referencesModule: typeof import('../../src/infrastructure/postgres/command-receipts.js') =
    await import(
      new URL(
        '../../dist/infrastructure/postgres/command-receipts.js',
        import.meta.url,
      ).href
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
        BETTER_AUTH_SECRET: 'fictional-api01-compiled-smoke-secret',
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
    const email = `compiled-receipt-${letter}@example.test`,
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
      context: await contextModule.resolveCloudInventory(
        first.runtime.database,
        authenticated,
        dataset.inventory.id,
      ),
    };
  }
  const a = await owner('a'),
    b = await owner('b');
  const command = purchaseCommand();
  const accepted = await engineModule.createCommandExecutor(
    first.runtime.database,
    () => 2000,
  )({
    context: a.context,
    command,
    requestId: 'internal-fixture',
    payloadHash: fingerprintModule.commandFingerprint(
      a.context.inventory.id,
      command,
    ),
    execute: async () => ({
      status: 'ACCEPTED',
      changes: emptyChanges(),
      references: referencesModule.commandReferences(command),
    }),
  });
  const path = `/v1/inventories/${a.context.inventory.id}/operations/${command.operationId}`;
  const before = await freshFetch(`${baseURL}${path}`, {
    headers: { cookie: a.cookie },
  });
  assert.equal(before.status, 200);
  assert.equal(before.headers.get('cache-control'), 'no-store');
  const beforeBody: unknown = await before.json();
  createSchemaValidator(operationReceiptSchema)(beforeBody);
  assert.deepEqual(beforeBody, accepted);
  await first.current.close();
  const second = start();
  await second.current.listen({ host: '127.0.0.1', port: address.port });
  const after = await freshFetch(`${baseURL}${path}`, {
    headers: { cookie: a.cookie },
  });
  assert.equal(after.status, 200);
  assert.deepEqual(await after.json(), beforeBody);
  assert.notEqual(
    after.headers.get('x-request-id'),
    before.headers.get('x-request-id'),
  );
  assert.equal(
    (await freshFetch(`${baseURL}${path}`, { headers: { cookie: b.cookie } }))
      .status,
    404,
  );
  assert.equal(
    (
      await freshFetch(
        `${baseURL}/v1/inventories/${b.context.inventory.id}/operations/${command.operationId}`,
        { headers: { cookie: b.cookie } },
      )
    ).status,
    404,
  );
  assert.equal((await freshFetch(`${baseURL}/live`)).status, 200);
  assert.equal((await freshFetch(`${baseURL}/health`)).status, 404);
  const replay = await engineModule.createCommandExecutor(
    second.runtime.database,
  )({
    context: a.context,
    command,
    requestId: 'restart-fixture',
    payloadHash: fingerprintModule.commandFingerprint(
      a.context.inventory.id,
      command,
    ),
    execute: async () => {
      assert.fail('Durable replay must not run callback.');
    },
  });
  assert.deepEqual(replay, accepted);
  assert.equal(
    (
      await pool.query('SELECT revision FROM inventories WHERE id=$1', [
        a.context.inventory.id,
      ])
    ).rows[0].revision,
    '1',
  );
  await second.current.close();
});
