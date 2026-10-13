import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, access } from 'node:fs/promises';
import { test, type TestContext } from 'node:test';
import { createServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import { readServerConfig } from '../../src/config.js';
import { disposableDatabase } from './helpers.js';
import { migrateDatabase } from '../../src/infrastructure/postgres/migrate.js';

async function freePort(): Promise<number> {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const address = probe.address();
  assert.ok(address && typeof address !== 'string');
  await new Promise<void>((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

async function compiledProcess(t: TestContext, env: NodeJS.ProcessEnv) {
  const entry = new URL('../../dist/server.js', import.meta.url).href;
  // Windows cannot deliver POSIX SIGTERM. Only its harness emits the same Node signal;
  // Linux CI delivers a real SIGTERM to the compiled entrypoint process.
  const harness = `
    const { startServer } = await import(${JSON.stringify(entry)});
    await startServer();
    process.send({ type: 'started' });
    if (process.exitCode) process.disconnect();
    else process.on('message', () => {
      process.emit('SIGTERM');
      process.disconnect();
    });
  `;
  const child = spawn(
    process.execPath,
    ['--input-type=module', '-e', harness],
    {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        NODE_ENV: 'production',
        ...env,
      },
    },
  );
  const exited = once(child, 'exit');
  let logs = '';
  assert.ok(child.stdout && child.stderr);
  child.stdout.on('data', (chunk: Buffer) => {
    logs += chunk.toString();
  });
  child.stderr.on('data', (chunk: Buffer) => {
    logs += chunk.toString();
  });
  t.after(() => {
    if (child.exitCode === null) child.kill('SIGKILL');
  });
  await once(child, 'message');
  return {
    child,
    exited,
    logs: () => logs,
    stop() {
      if (process.platform === 'win32') child.send('stop');
      else {
        child.disconnect();
        child.kill('SIGTERM');
      }
    },
  };
}

test('compiled UAT assets include Contracts, shared chunks and versioned SQL', async () => {
  const api = new URL('../../dist/server.js', import.meta.url);
  await access(api);
  await access(
    new URL('../../../../packages/contracts/dist/index.js', import.meta.url),
  );
  const migration: typeof import('../../src/infrastructure/postgres/migrate.js') =
    await import(
      new URL('../../dist/infrastructure/postgres/migrate.js', import.meta.url)
        .href
    );
  const journal = JSON.parse(
    await readFile(
      new URL('../../drizzle/meta/_journal.json', import.meta.url),
      'utf8',
    ),
  ) as { entries: { tag: string }[] };
  for (const { tag } of journal.entries)
    await access(`${migration.migrationsFolder}/${tag}.sql`);
  const product: typeof import('../../src/products/execute.js') = await import(
    new URL('../../dist/products/execute.js', import.meta.url).href
  );
  assert.ok(product);
  const root = JSON.parse(
    await readFile(
      new URL('../../../../package.json', import.meta.url),
      'utf8',
    ),
  ) as { packageManager: string; engines: { node: string } };
  assert.equal(root.packageManager, 'pnpm@11.0.9');
  assert.equal(root.engines.node, '>=22.16.0');
  assert.deepEqual(readServerConfig({ PORT: '43127' }), {
    host: '0.0.0.0',
    port: 43127,
  });
});

test(
  'compiled foundation starts on supplied PORT and drains on SIGTERM',
  { timeout: 15000 },
  async (t) => {
    const port = await freePort();
    const runtime = await compiledProcess(t, { PORT: String(port) });
    const response = await fetch(`http://127.0.0.1:${port}/live`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
    assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status, 503);
    const interfaceAddress = Object.values(networkInterfaces())
      .flat()
      .find((address) => address?.family === 'IPv4' && !address.internal);
    assert.ok(interfaceAddress);
    assert.equal(
      (await fetch(`http://${interfaceAddress.address}:${port}/live`)).status,
      200,
    );
    runtime.stop();
    const [code, signal] = await runtime.exited;
    assert.equal(code, 0);
    assert.equal(signal, null);
    await assert.rejects(fetch(`http://127.0.0.1:${port}/live`));
  },
);

test(
  'compiled configured runtime fails closed before migrations, becomes ready, and closes workers/resources',
  { timeout: 15000 },
  async (t) => {
    const pool = await disposableDatabase(t);
    const port = await freePort();
    const runtime = await compiledProcess(t, {
      PORT: String(port),
      DATABASE_URL: pool.options.connectionString,
      AUTH_BASE_URL: 'https://api.example.test',
      APP_ORIGIN: 'https://web.example.test',
      BETTER_AUTH_SECRET: 'fictional-dev01-auth-test-only-secret',
      DELETION_SUPPRESSION_SECRET: 'fictional-dev01-suppression-test-secret',
      SMTP_HOST: 'smtp.example.test',
      SMTP_PORT: '465',
      SMTP_SECURITY: 'tls',
      SMTP_FROM: 'auth@example.test',
    });
    const baseURL = `http://127.0.0.1:${port}`;
    assert.equal((await fetch(`${baseURL}/live`)).status, 200);
    assert.equal((await fetch(`${baseURL}/health`)).status, 503);
    assert.deepEqual(
      (
        await pool.query(
          "SELECT tablename FROM pg_tables WHERE schemaname IN ('public','drizzle')",
        )
      ).rows,
      [],
    );
    await migrateDatabase(pool);
    const before = (
      await pool.query('SELECT * FROM drizzle.__drizzle_migrations ORDER BY id')
    ).rows;
    const health = await fetch(`${baseURL}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.equal(health.headers.get('cache-control'), 'no-store');
    assert.equal((await fetch(`${baseURL}/v1/me`)).status, 401);
    assert.deepEqual(
      (
        await pool.query(
          'SELECT * FROM drizzle.__drizzle_migrations ORDER BY id',
        )
      ).rows,
      before,
    );
    runtime.stop();
    const [code, signal] = await runtime.exited;
    assert.equal(code, 0);
    assert.equal(signal, null);
    assert.equal(
      (await pool.query('SELECT count(*) FROM deletion_requests')).rows[0]
        .count,
      '0',
    );
    assert.doesNotMatch(
      runtime.logs(),
      /fictional-dev01|postgresql:|SMTP_FROM|SELECT|relation|stack/,
    );
  },
);

test(
  'compiled invalid PORT and incomplete auth fail with sanitized logs and exit 1',
  { timeout: 15000 },
  async (t) => {
    for (const env of [
      { PORT: 'INVALID_PORT_PRIVATE_MARKER' },
      { PORT: '43127', AUTH_BASE_URL: 'https://private-config.example.test' },
    ]) {
      const runtime = await compiledProcess(t, env);
      const [code, signal] = await runtime.exited;
      assert.equal(code, 1);
      assert.equal(signal, null);
      assert.match(runtime.logs(), /Could not start HTTP server/);
      assert.doesNotMatch(
        runtime.logs(),
        /INVALID_PORT_PRIVATE_MARKER|private-config|BETTER_AUTH_SECRET|stack|postgresql/,
      );
    }
  },
);
