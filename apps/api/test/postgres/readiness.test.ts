import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../../src/app.js';
import { createReadinessCheck } from '../../src/infrastructure/postgres/readiness.js';
import { migrateDatabase } from '../../src/infrastructure/postgres/migrate.js';
import { createPostgresPool } from '../../src/infrastructure/postgres/client.js';
import { readTestDatabaseUrl } from '../../src/infrastructure/postgres/config.js';
import {
  disposableDatabase,
  migrationPrefix,
  id,
  insertFixtureUser,
} from './helpers.js';

test('readiness verifies real migration identity and required schema without writes', async (t) => {
  const pool = await disposableDatabase(t);
  assert.ok(pool.options.connectionString);
  const readiness = createReadinessCheck(pool.options.connectionString);
  t.after(() => readiness.close());
  const app = buildApp({ readiness: readiness.check });
  t.after(() => app.close());
  const status = async (expected: number) => {
    const response = await app.inject('/health');
    assert.equal(response.statusCode, expected);
    assert.equal(response.headers['cache-control'], 'no-store');
    if (expected === 200) assert.deepEqual(response.json(), { status: 'ok' });
    else {
      assert.equal(response.json().error.code, 'TEMPORARILY_UNAVAILABLE');
      assert.equal(
        response.json().error.requestId,
        response.headers['x-request-id'],
      );
      assert.doesNotMatch(
        response.body,
        /postgres|SELECT|relation|password|stack/,
      );
    }
    assert.equal((await app.inject('/live')).statusCode, 200);
  };
  await t.test(
    'empty schema is not ready and health does not migrate it',
    async () => {
      await status(503);
      assert.deepEqual(
        (
          await pool.query(
            "SELECT tablename FROM pg_tables WHERE schemaname IN ('public','drizzle')",
          )
        ).rows,
        [],
      );
    },
  );
  await t.test('previous migration set is not ready', async () => {
    await migrateDatabase(pool, await migrationPrefix(t, 4));
    await status(503);
    assert.equal(
      (await pool.query('SELECT count(*) FROM drizzle.__drizzle_migrations'))
        .rows[0].count,
      '4',
    );
  });
  await migrateDatabase(pool);
  const userId = id();
  const businessId = id();
  const inventoryId = id();
  await insertFixtureUser(pool, userId);
  await pool.query('INSERT INTO businesses (id,owner_user_id) VALUES ($1,$2)', [
    businessId,
    userId,
  ]);
  await pool.query(
    "INSERT INTO inventories (id,business_id,name,currency,reporting_time_zone,revision,created_at,updated_at) VALUES ($1,$2,'Fixture','USD','America/Guayaquil',7,1000,1000)",
    [inventoryId, businessId],
  );
  await t.test(
    'latest compatible schema is ready; GET does not change rows or sequences',
    async () => {
      const client = await pool.connect();
      const tables = (
        await client.query<{ tablename: string }>(
          "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
        )
      ).rows;
      const snapshot = async () => {
        const rows: unknown[] = [];
        for (const table of tables)
          rows.push(
            (await client.query(`SELECT * FROM public."${table.tablename}"`))
              .rows,
          );
        rows.push(
          (
            await client.query(
              'SELECT * FROM drizzle.__drizzle_migrations ORDER BY id',
            )
          ).rows,
        );
        rows.push(
          (
            await client.query(
              "SELECT schemaname, sequencename, last_value FROM pg_sequences WHERE schemaname IN ('public','drizzle') ORDER BY schemaname,sequencename",
            )
          ).rows,
        );
        return rows;
      };
      try {
        const before = await snapshot();
        await status(200);
        await status(200);
        assert.deepEqual(await snapshot(), before);
      } finally {
        client.release();
      }
    },
  );
  await t.test(
    'tampered migration hash is not ready and is not repaired',
    async () => {
      const migration = (
        await pool.query<{ id: number; hash: string }>(
          'SELECT id, hash FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1',
        )
      ).rows[0];
      await pool.query(
        'UPDATE drizzle.__drizzle_migrations SET hash=$1 WHERE id=$2',
        ['fixture-tampered-hash', migration.id],
      );
      await status(503);
      assert.equal(
        (
          await pool.query(
            'SELECT hash FROM drizzle.__drizzle_migrations WHERE id=$1',
            [migration.id],
          )
        ).rows[0].hash,
        'fixture-tampered-hash',
      );
      await pool.query(
        'UPDATE drizzle.__drizzle_migrations SET hash=$1 WHERE id=$2',
        [migration.hash, migration.id],
      );
    },
  );
  for (const [name, sql] of [
    ['missing column', 'ALTER TABLE products DROP COLUMN variant'],
    [
      'incompatible column type',
      'ALTER TABLE "user" ALTER COLUMN image TYPE integer USING NULL',
    ],
    [
      'incompatible nullability',
      'ALTER TABLE products ALTER COLUMN name DROP NOT NULL',
    ],
    [
      'missing table',
      'ALTER TABLE products RENAME TO fixture_missing_products',
    ],
  ])
    await t.test(
      `${name} fails after successful startup even with latest migration ledger`,
      async () => {
        const transaction = await pool.connect();
        try {
          await transaction.query('BEGIN');
          await transaction.query(sql);
          await transaction.query('COMMIT');
          await status(503);
        } finally {
          // The fixture uses a fresh database per outer test; restore only the controlled change.
          transaction.release();
        }
        if (name === 'missing column')
          await pool.query('ALTER TABLE products ADD COLUMN variant text');
        if (name === 'incompatible column type')
          await pool.query(
            'ALTER TABLE "user" ALTER COLUMN image TYPE text USING NULL',
          );
        if (name === 'incompatible nullability')
          await pool.query(
            'ALTER TABLE products ALTER COLUMN name SET NOT NULL',
          );
        if (name === 'missing table')
          await pool.query(
            'ALTER TABLE fixture_missing_products RENAME TO products',
          );
        await status(200);
      },
    );
  await t.test(
    'DB failure after startup does not leave cached green readiness',
    async () => {
      await status(200);
      const name = new URL(pool.options.connectionString!).pathname.slice(1);
      assert.match(name, /^stockapp_test_[a-z0-9]+$/);
      const admin = createPostgresPool(readTestDatabaseUrl(process.env));
      const control = await admin.connect();
      try {
        await control.query(
          `ALTER DATABASE "${name}" WITH ALLOW_CONNECTIONS false`,
        );
        await status(503);
      } finally {
        await control.query(
          `ALTER DATABASE "${name}" WITH ALLOW_CONNECTIONS true`,
        );
        control.release();
        await admin.end();
      }
      await status(200);
    },
  );
});
