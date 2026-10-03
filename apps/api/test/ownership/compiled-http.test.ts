import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { localSmtp } from '../helpers/smtp.js';
import { disposableDatabase } from '../postgres/helpers.js';
import { migrateDatabase } from '../../src/infrastructure/postgres/migrate.js';

type Dataset = {
  business: { id: string; cloudAccessEnabled: boolean };
  inventory: {
    id: string;
    name: string;
    currency: string;
    reportingTimeZone: string;
  };
};

function assertDataset(value: unknown): asserts value is Dataset {
  assert.ok(
    value &&
      typeof value === 'object' &&
      'business' in value &&
      'inventory' in value,
  );
  const { business, inventory } = value;
  assert.ok(
    business &&
      typeof business === 'object' &&
      'id' in business &&
      typeof business.id === 'string' &&
      'cloudAccessEnabled' in business &&
      typeof business.cloudAccessEnabled === 'boolean',
  );
  assert.ok(
    inventory &&
      typeof inventory === 'object' &&
      'id' in inventory &&
      typeof inventory.id === 'string' &&
      'name' in inventory &&
      typeof inventory.name === 'string' &&
      'currency' in inventory &&
      typeof inventory.currency === 'string' &&
      'reportingTimeZone' in inventory &&
      typeof inventory.reportingTimeZone === 'string',
  );
}

test('compiled HTTP + real PostgreSQL + local SMTP + compiled operator CLI complete A/B onboarding', async (t) => {
  const appModule: typeof import('../../src/app.js') = await import(
    new URL('../../dist/app.js', import.meta.url).href
  );
  const runtimeModule: typeof import('../../src/auth/runtime.js') =
    await import(new URL('../../dist/auth/runtime.js', import.meta.url).href);
  const authModule: typeof import('../../src/auth/routes.js') = await import(
    new URL('../../dist/auth/routes.js', import.meta.url).href
  );
  const ownershipModule: typeof import('../../src/ownership/routes.js') =
    await import(
      new URL('../../dist/ownership/routes.js', import.meta.url).href
    );
  const pool = await disposableDatabase(t);
  await migrateDatabase(pool);
  const smtp = await localSmtp(t);
  const probe = appModule.buildApp();
  await probe.listen({ host: '127.0.0.1', port: 0 });
  const address = probe.server.address();
  assert.ok(address && typeof address !== 'string');
  await probe.close();
  const baseURL = `http://127.0.0.1:${address.port}`;
  const app = appModule.buildApp();
  const runtime = runtimeModule.createAuthRuntime(
    {
      DATABASE_URL: pool.options.connectionString,
      AUTH_BASE_URL: baseURL,
      APP_ORIGIN: 'http://localhost:5173',
      BETTER_AUTH_SECRET: 'fictional-cloud04-compiled-smoke-secret',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(smtp.port),
      SMTP_SECURITY: 'local',
      SMTP_FROM: 'auth@example.test',
    },
    () => assert.fail('local SMTP must succeed'),
  );
  app.addHook('onClose', () => runtime.close());
  authModule.registerAuthRoutes(app, runtime.auth, runtime.config);
  ownershipModule.registerOwnershipRoutes(app, runtime.auth, runtime.database);
  t.after(() => app.close());
  await app.listen({ host: '127.0.0.1', port: address.port });
  const post = (path: string, body: unknown, cookie?: string) =>
    fetch(`${baseURL}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: runtime.config.appOrigin,
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
      redirect: 'manual',
    });
  const get = (path: string, cookie?: string) =>
    fetch(`${baseURL}${path}`, {
      headers: cookie ? { cookie } : {},
      redirect: 'manual',
    });
  async function operator(
    userId: string,
    action: '--enable' | '--disable',
    expected = 0,
  ) {
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(
          new URL('../../dist/ownership/pilot-cli.js', import.meta.url),
        ),
        '--user-id',
        userId,
        action,
      ],
      {
        env: { ...process.env, DATABASE_URL: pool.options.connectionString },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let output = '';
    child.stdout.on('data', (data) => {
      output += String(data);
    });
    child.stderr.on('data', (data) => {
      output += String(data);
    });
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    assert.equal(exitCode, expected, output);
    assert.doesNotMatch(
      output,
      /example.test|postgresql|password|session|SELECT|constraint|stack/,
    );
  }
  async function onboarding(letter: string) {
    const email = `compiled-${letter}@example.test`;
    assert.equal(
      (
        await post('/api/auth/sign-up/email', {
          name: 'Fictional',
          email,
          password: 'fictional-compiled-password',
        })
      ).status,
      200,
    );
    await runtime.drainEmails();
    const content = smtp.messages
      .at(-1)
      ?.replace(/=\r?\n/g, '')
      .replace(/=([0-9A-F]{2})/gi, (_match, value: string) =>
        String.fromCharCode(parseInt(value, 16)),
      );
    const link = content?.match(/http:\/\/[^\s]+/);
    assert.ok(link);
    assert.equal((await fetch(link[0], { redirect: 'manual' })).status, 302);
    const login = await post('/api/auth/sign-in/email', {
      email,
      password: 'fictional-compiled-password',
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.getSetCookie()[0].split(';')[0];
    const me = await get('/v1/me', cookie);
    assert.equal(me.status, 200);
    assert.equal(me.headers.get('cache-control'), 'no-store');
    const identity: unknown = await me.json();
    assert.ok(
      identity &&
        typeof identity === 'object' &&
        'user' in identity &&
        'business' in identity &&
        'inventory' in identity,
    );
    assert.ok(
      identity.user &&
        typeof identity.user === 'object' &&
        'id' in identity.user &&
        typeof identity.user.id === 'string',
    );
    assert.equal(identity.business, null);
    assert.equal(identity.inventory, null);
    const created = await post(
      '/v1/business',
      {
        inventoryName: `Empty ${letter}`,
        currency: 'USD',
        reportingTimeZone: 'America/Guayaquil',
      },
      cookie,
    );
    assert.equal(created.status, 201);
    assert.equal(created.headers.get('cache-control'), 'no-store');
    const dataset: unknown = await created.json();
    assertDataset(dataset);
    assert.equal(dataset.business.cloudAccessEnabled, false);
    assert.equal(
      (await get(`/v1/inventories/${dataset.inventory.id}`, cookie)).status,
      403,
    );
    await operator(identity.user.id, '--enable');
    await operator(identity.user.id, '--enable');
    return { cookie, userId: identity.user.id, dataset };
  }
  assert.equal((await get('/live')).status, 200);
  assert.equal((await get('/health')).status, 404);
  await operator('missing-fictional-user', '--enable', 1);
  const a = await onboarding('a'),
    b = await onboarding('b');
  for (const [owner, foreign] of [
    [a, b],
    [b, a],
  ]) {
    const own = await get(
      `/v1/inventories/${owner.dataset.inventory.id}`,
      owner.cookie,
    );
    assert.equal(own.status, 200);
    assert.deepEqual(await own.json(), owner.dataset.inventory);
    const rejected = await get(
      `/v1/inventories/${foreign.dataset.inventory.id}`,
      owner.cookie,
    );
    assert.equal(rejected.status, 404);
    assert.equal(rejected.headers.get('cache-control'), 'no-store');
    const body: unknown = await rejected.json();
    assert.ok(
      body &&
        typeof body === 'object' &&
        'error' in body &&
        body.error &&
        typeof body.error === 'object' &&
        'code' in body.error &&
        'requestId' in body.error,
    );
    assert.equal(body.error.code, 'NOT_FOUND');
    assert.equal(body.error.requestId, rejected.headers.get('x-request-id'));
    const me: unknown = await (await get('/v1/me', owner.cookie)).json();
    assertDataset(me);
    assert.equal(me.business.cloudAccessEnabled, true);
  }
  await operator(a.userId, '--disable');
  await operator(a.userId, '--disable');
  assert.equal(
    (await get(`/v1/inventories/${a.dataset.inventory.id}`, a.cookie)).status,
    403,
  );
  for (const owner of [a, b]) {
    assert.equal(
      (await post('/api/auth/sign-out', {}, owner.cookie)).status,
      200,
    );
    assert.equal((await get('/v1/me', owner.cookie)).status, 401);
  }
  assert.equal((await pool.query('SELECT id FROM businesses')).rowCount, 2);
  assert.equal((await pool.query('SELECT id FROM inventories')).rowCount, 2);
  for (const table of ['products', 'sales', 'purchases', 'session'])
    assert.equal((await pool.query(`SELECT id FROM ${table}`)).rowCount, 0);
  assert.deepEqual(smtp.recipients, [
    'compiled-a@example.test',
    'compiled-b@example.test',
  ]);
  await app.close();
  assert.equal(app.server.listening, false);
});
