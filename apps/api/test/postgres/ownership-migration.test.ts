import assert from 'node:assert/strict';
import { test } from 'node:test';
import { migrateDatabase } from '../../src/infrastructure/postgres/migrate.js';
import {
  disposableDatabase,
  id,
  insertFixtureUser,
  migrationPrefix,
} from './helpers.js';

test('CLOUD-03 valid ownership upgrade preserves identity and financial fixture, then no-op', async (t) => {
  const pool = await disposableDatabase(t);
  await migrateDatabase(pool, await migrationPrefix(t, 3));
  await insertFixtureUser(pool, 'valid-owner');
  const business = id(),
    inventory = id(),
    product = id();
  await pool.query('INSERT INTO businesses(id,owner_user_id) VALUES ($1,$2)', [
    business,
    'valid-owner',
  ]);
  await pool.query(
    "INSERT INTO inventories(id,business_id,name,currency,reporting_time_zone,revision,created_at,updated_at) VALUES ($1,$2,'Fictional','USD','UTC',9007199254740992,1,1)",
    [inventory, business],
  );
  await pool.query(
    "INSERT INTO products(id,inventory_id,name,regular_sale_price_units,is_archived,created_at,updated_at) VALUES ($1,$2,'Fictional',9007199254740991,true,1,1)",
    [product, inventory],
  );
  await pool.query(
    'INSERT INTO inventory_states(inventory_id,product_id,stock,unit_cost_units) VALUES ($1,$2,-2,NULL)',
    [inventory, product],
  );
  const tables = [
    'user',
    'businesses',
    'inventories',
    'products',
    'inventory_states',
  ];
  const before = await Promise.all(
    tables.map((table) => pool.query(`SELECT * FROM "${table}"`)),
  );
  const oldJournal = (
    await pool.query('SELECT * FROM drizzle.__drizzle_migrations ORDER BY id')
  ).rows;
  await migrateDatabase(pool);
  for (let i = 0; i < tables.length; i++)
    assert.deepEqual(
      (await pool.query(`SELECT * FROM "${tables[i]}"`)).rows,
      before[i].rows,
    );
  const journal = (
    await pool.query('SELECT * FROM drizzle.__drizzle_migrations ORDER BY id')
  ).rows;
  assert.equal(journal.length, 4);
  assert.deepEqual(journal.slice(0, 3), oldJournal);
  await migrateDatabase(pool);
  assert.deepEqual(
    (await pool.query('SELECT * FROM drizzle.__drizzle_migrations ORDER BY id'))
      .rows,
    journal,
  );
});

test('CLOUD-03 orphan owner rejects ownership migration without deletion, fake user or reassignment', async (t) => {
  const pool = await disposableDatabase(t);
  await migrateDatabase(pool, await migrationPrefix(t, 3));
  const business = id(),
    inventory = id();
  await pool.query('INSERT INTO businesses(id,owner_user_id) VALUES ($1,$2)', [
    business,
    'orphan-owner',
  ]);
  await pool.query(
    "INSERT INTO inventories(id,business_id,name,currency,reporting_time_zone,created_at,updated_at) VALUES ($1,$2,'Orphan fixture','USD','UTC',1,1)",
    [inventory, business],
  );
  const before = await pool.query('SELECT * FROM businesses');
  const inventoryBefore = await pool.query('SELECT * FROM inventories');
  const journal = await pool.query(
    'SELECT * FROM drizzle.__drizzle_migrations ORDER BY id',
  );
  await assert.rejects(
    migrateDatabase(pool),
    (error: unknown) =>
      error instanceof Error &&
      'cause' in error &&
      error.cause instanceof Error &&
      'code' in error.cause &&
      error.cause.code === '23503',
  );
  assert.deepEqual(
    (await pool.query('SELECT * FROM businesses')).rows,
    before.rows,
  );
  assert.deepEqual(
    (await pool.query('SELECT * FROM inventories')).rows,
    inventoryBefore.rows,
  );
  assert.equal((await pool.query('SELECT id FROM "user"')).rowCount, 0);
  assert.deepEqual(
    (await pool.query('SELECT * FROM drizzle.__drizzle_migrations ORDER BY id'))
      .rows,
    journal.rows,
  );
});

test('owner FK is non-cascading, unique and references the actual Better Auth user', async (t) => {
  const pool = await disposableDatabase(t);
  await migrateDatabase(pool);
  await insertFixtureUser(pool, 'fk-owner');
  const business = id();
  await pool.query('INSERT INTO businesses(id,owner_user_id) VALUES ($1,$2)', [
    business,
    'fk-owner',
  ]);
  await assert.rejects(
    pool.query('INSERT INTO businesses(id,owner_user_id) VALUES ($1,$2)', [
      id(),
      'missing',
    ]),
    { code: '23503' },
  );
  await assert.rejects(
    pool.query('INSERT INTO businesses(id,owner_user_id) VALUES ($1,$2)', [
      id(),
      'fk-owner',
    ]),
    { code: '23505' },
  );
  await assert.rejects(
    pool.query('DELETE FROM "user" WHERE id=$1', ['fk-owner']),
    { code: '23503' },
  );
  assert.equal(
    (await pool.query('SELECT id FROM businesses WHERE id=$1', [business]))
      .rowCount,
    1,
  );
  const fk = await pool.query(
    "SELECT confdeltype,confupdtype FROM pg_constraint WHERE conname='businesses_owner_user_id_user_id_fk'",
  );
  assert.deepEqual(fk.rows, [{ confdeltype: 'a', confupdtype: 'a' }]);
});
