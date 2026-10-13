import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { test } from 'node:test';
import { Writable } from 'node:stream';
import { contractSchemas, createSchemaValidator } from '@stock-app/contracts';
import { buildApp } from '../src/app.js';
import {
  createReadinessCheck,
  READINESS_DEADLINE_MS,
} from '../src/infrastructure/postgres/readiness.js';

test('public readiness is fail-closed without composition; /live remains independent', async (t) => {
  const app = buildApp();
  t.after(() => app.close());
  const health = await app.inject('/health');
  assert.equal(health.statusCode, 503);
  createSchemaValidator(contractSchemas.ApiError)(health.json());
  assert.deepEqual(health.json(), {
    error: {
      code: 'TEMPORARILY_UNAVAILABLE',
      message: 'El servicio no está disponible temporalmente.',
      requestId: health.headers['x-request-id'],
    },
  });
  assert.equal(health.headers['cache-control'], 'no-store');
  assert.equal((await app.inject('/live')).statusCode, 200);
});

test('Health schema, public GET without cookie/CSRF, no-store and sanitized failures', async (t) => {
  let ready = true;
  const logs: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      logs.push(String(chunk));
      callback();
    },
  });
  const app = buildApp({
    logger: true,
    logStream: stream,
    readiness: async () => {
      if (!ready) throw new Error('PRIVATE_SQL_PASSWORD_DATABASE_URL');
      return true;
    },
  });
  t.after(() => app.close());
  const health = await app.inject('/health');
  assert.equal(health.statusCode, 200);
  createSchemaValidator(contractSchemas.Health)(health.json());
  assert.deepEqual(health.json(), { status: 'ok' });
  assert.equal(health.headers['cache-control'], 'no-store');
  ready = false;
  const failed = await app.inject('/health');
  assert.equal(failed.statusCode, 503);
  assert.equal(failed.json().error.requestId, failed.headers['x-request-id']);
  assert.doesNotMatch(
    failed.body + logs.join(''),
    /PRIVATE_SQL_PASSWORD_DATABASE_URL|stack|connectionString/,
  );
  assert.equal((await app.inject('/live')).statusCode, 200);
});

test('unreachable DB is unavailable; closing health prevents new connections', async () => {
  const readiness = createReadinessCheck(
    'postgresql://postgres@127.0.0.1:1/unavailable',
  );
  try {
    assert.equal(await readiness.check(), false);
  } finally {
    await readiness.close();
  }
  assert.equal(await readiness.check(), false);
});

test(
  'stalled PostgreSQL handshake is bounded, single-flight and releases socket',
  { timeout: 10000 },
  async (t) => {
    let connections = 0;
    const closed: Promise<unknown[]>[] = [];
    const server = createServer((socket) => {
      connections++;
      socket.on('data', () => {});
      closed.push(once(socket, 'close'));
      t.after(() => socket.destroy());
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(
      () =>
        new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
    );
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const readiness = createReadinessCheck(
      `postgresql://postgres@127.0.0.1:${address.port}/unavailable`,
    );
    t.after(() => readiness.close());
    const start = performance.now();
    const first = readiness.check();
    assert.equal(readiness.check(), first);
    assert.deepEqual(await Promise.all([first, readiness.check()]), [
      false,
      false,
    ]);
    assert.ok(performance.now() - start < READINESS_DEADLINE_MS + 1000);
    await Promise.all(closed);
    assert.equal(connections, 1);
  },
);
