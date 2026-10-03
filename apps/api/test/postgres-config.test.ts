import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  readDatabaseUrl,
  readTestDatabaseUrl,
} from '../src/infrastructure/postgres/config.js';
import { createPostgresPool } from '../src/infrastructure/postgres/client.js';
import { buildApp } from '../src/app.js';

test('DB configuration is explicit and test configuration never falls back to runtime', () => {
  const runtime = { DATABASE_URL: 'postgresql://localhost/production' };
  assert.equal(readDatabaseUrl(runtime), runtime.DATABASE_URL);
  assert.throws(() => readDatabaseUrl({}), /DATABASE_URL is required/);
  assert.throws(
    () => readTestDatabaseUrl(runtime),
    /TEST_DATABASE_URL is required/,
  );
  for (const url of [
    '',
    'not-a-url',
    'https://localhost/stockapp_test',
    'postgresql://remote.example/stockapp_test',
    'postgresql://localhost/production',
    'postgresql://localhost/stockapp_test?host=remote.example',
    'postgresql://localhost/stockapp_test#other',
  ]) {
    assert.throws(() => readTestDatabaseUrl({ TEST_DATABASE_URL: url }));
  }
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    const url = `postgresql://${host}/stockapp_test`;
    assert.equal(readTestDatabaseUrl({ TEST_DATABASE_URL: url }), url);
  }
});

test('creating a pool or importing the migration runner does not connect or migrate', async () => {
  const pool = createPostgresPool('postgresql://127.0.0.1:1/unavailable');
  assert.equal(pool.totalCount, 0);
  await import('../src/infrastructure/postgres/migrate.js');
  assert.equal(pool.totalCount, 0);
  await pool.end();
});

test('liveness remains independent of unavailable or absent DB and readiness stays absent', async (t) => {
  const previous = process.env.DATABASE_URL;
  t.after(() => {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  });
  for (const url of [undefined, 'postgresql://127.0.0.1:1/unavailable']) {
    if (url === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = url;
    const app = buildApp();
    try {
      const response = await app.inject('/live');
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json(), { status: 'ok' });
      assert.equal((await app.inject('/health')).statusCode, 404);
    } finally {
      await app.close();
    }
  }
});
