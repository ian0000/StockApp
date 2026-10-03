import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  readFile,
  mkdtemp,
  copyFile,
  mkdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  migrateDatabase,
  migrationsFolder,
} from '../../src/infrastructure/postgres/migrate.js';
import { disposableDatabase, id } from './helpers.js';

test('real PostgreSQL migrates empty to latest and second run is a no-op', async (t) => {
  const pool = await disposableDatabase(t);
  await migrateDatabase(pool);
  const tables = await pool.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
  );
  assert.deepEqual(
    tables.rows.map((row) => row.table_name),
    [
      'account',
      'businesses',
      'deletion_requests',
      'import_sessions',
      'inventories',
      'inventory_change_sets',
      'inventory_movements',
      'inventory_states',
      'operation_receipts',
      'products',
      'purchases',
      'sale_items',
      'sales',
      'session',
      'stock_adjustments',
      'sync_devices',
      'user',
      'verification',
    ],
  );
  const journal = await pool.query(
    'SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id',
  );
  assert.equal(journal.rowCount, 3);
  await migrateDatabase(pool);
  assert.deepEqual(
    (
      await pool.query(
        'SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id',
      )
    ).rows,
    journal.rows,
  );
  const version = await pool.query<{ version: string }>('SELECT version()');
  assert.match(version.rows[0].version, /^PostgreSQL /);
});

test('upgrade from core revision preserves financial data and adds delivery schema/defaults', async (t) => {
  const pool = await disposableDatabase(t);
  const folder = await mkdtemp(join(tmpdir(), 'stockapp-migration-fixture-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  await mkdir(join(folder, 'meta'));
  const journalPath = join(migrationsFolder, 'meta', '_journal.json');
  const journal: { entries: { tag: string }[] } = JSON.parse(
    await readFile(journalPath, 'utf8'),
  );
  const first = journal.entries[0];
  assert.ok(first);
  await copyFile(
    join(migrationsFolder, `${first.tag}.sql`),
    join(folder, `${first.tag}.sql`),
  );
  await writeFile(
    join(folder, 'meta', '_journal.json'),
    JSON.stringify({ ...journal, entries: [first] }),
  );
  await migrateDatabase(pool, folder);
  const business = id(),
    inventory = id(),
    product = id(),
    sale = id(),
    item = id();
  await pool.query(
    'INSERT INTO businesses (id, owner_user_id) VALUES ($1, $2)',
    [business, 'fixture-owner'],
  );
  await pool.query(
    "INSERT INTO inventories (id, business_id, name, currency, reporting_time_zone, created_at, updated_at) VALUES ($1,$2,'Fixture','USD','America/Guayaquil',1,1)",
    [inventory, business],
  );
  await pool.query(
    "INSERT INTO products (id,inventory_id,name,regular_sale_price_units,created_at,updated_at) VALUES ($1,$2,'Archived zero cost',9007199254740991,1,1)",
    [product, inventory],
  );
  await pool.query('UPDATE products SET is_archived = true WHERE id = $1', [
    product,
  ]);
  await pool.query(
    'INSERT INTO inventory_states (inventory_id,product_id,stock,unit_cost_units) VALUES ($1,$2,-2,NULL)',
    [inventory, product],
  );
  await pool.query(
    "INSERT INTO sales (id,inventory_id,status,total_amount_units,estimated_cost_units,estimated_profit_units,effective_at,created_at,updated_at) VALUES ($1,$2,'VOIDED',6,0,6,1,1,1)",
    [sale, inventory],
  );
  await pool.query(
    "INSERT INTO sale_items (id,inventory_id,sale_id,product_id,quantity,unit_sale_price_units,subtotal_units,unit_cost_snapshot_units,estimated_cost_units,estimated_profit_units,cost_status,created_at,updated_at) VALUES ($1,$2,$3,$4,2,3,6,0,0,6,'KNOWN',1,1)",
    [item, inventory, sale, product],
  );
  const before = await pool.query('SELECT * FROM sale_items WHERE id = $1', [
    item,
  ]);
  assert.equal(
    (await pool.query('SELECT count(*) FROM drizzle.__drizzle_migrations'))
      .rows[0].count,
    '1',
  );
  await migrateDatabase(pool);
  assert.deepEqual(
    (await pool.query('SELECT * FROM sale_items WHERE id = $1', [item])).rows,
    before.rows,
  );
  const upgraded = (
    await pool.query(
      'SELECT metadata_revision,is_archived,regular_sale_price_units FROM products WHERE id = $1',
      [product],
    )
  ).rows[0];
  assert.deepEqual(upgraded, {
    metadata_revision: '0',
    is_archived: true,
    regular_sale_price_units: '9007199254740991',
  });
  const state = (
    await pool.query(
      'SELECT stock,unit_cost_units,state_revision,last_movement_id FROM inventory_states WHERE product_id = $1',
      [product],
    )
  ).rows[0];
  assert.deepEqual(state, {
    stock: '-2',
    unit_cost_units: null,
    state_revision: '0',
    last_movement_id: null,
  });
  assert.equal(
    (
      await pool.query('SELECT revision FROM inventories WHERE id=$1', [
        inventory,
      ])
    ).rows[0].revision,
    '0',
  );
  assert.equal(
    (await pool.query('SELECT count(*) FROM drizzle.__drizzle_migrations'))
      .rows[0].count,
    '3',
  );
  await assert.rejects(
    pool.query('UPDATE products SET metadata_revision=-1 WHERE id=$1', [
      product,
    ]),
    { code: '23514' },
  );
  const indexes = await pool.query<{ indexname: string }>(
    "SELECT indexname FROM pg_indexes WHERE schemaname='public'",
  );
  assert.ok(
    indexes.rows.some(
      (row) => row.indexname === 'inventory_movements_reversal_unique',
    ),
  );
  assert.ok(
    indexes.rows.some(
      (row) => row.indexname === 'import_sessions_business_status_idx',
    ),
  );
});

test('CLOUD-02 latest upgrades to auth without rewriting business/financial fixtures', async (t) => {
  const pool = await disposableDatabase(t);
  const folder = await mkdtemp(join(tmpdir(), 'stockapp-cloud02-fixture-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  await mkdir(join(folder, 'meta'));
  const journal: { entries: { tag: string }[] } = JSON.parse(
    await readFile(join(migrationsFolder, 'meta', '_journal.json'), 'utf8'),
  );
  const entries = journal.entries.slice(0, 2);
  assert.equal(entries.length, 2);
  for (const entry of entries) {
    await copyFile(
      join(migrationsFolder, `${entry.tag}.sql`),
      join(folder, `${entry.tag}.sql`),
    );
  }
  await writeFile(
    join(folder, 'meta', '_journal.json'),
    JSON.stringify({ ...journal, entries }),
  );
  await migrateDatabase(pool, folder);
  const business = id(),
    inventory = id(),
    product = id();
  await pool.query('INSERT INTO businesses(id,owner_user_id) VALUES ($1,$2)', [
    business,
    'fictional-cloud02-owner',
  ]);
  await pool.query(
    "INSERT INTO inventories(id,business_id,name,currency,reporting_time_zone,created_at,updated_at) VALUES ($1,$2,'Fictional','USD','America/Guayaquil',1,1)",
    [inventory, business],
  );
  await pool.query(
    "INSERT INTO products(id,inventory_id,name,regular_sale_price_units,is_archived,metadata_revision,created_at,updated_at) VALUES ($1,$2,'Fictional archived',9007199254740991,true,9007199254740992,1,1)",
    [product, inventory],
  );
  await pool.query(
    'INSERT INTO inventory_states(inventory_id,product_id,stock,unit_cost_units,state_revision) VALUES ($1,$2,-2,NULL,9007199254740992)',
    [inventory, product],
  );
  const tables = ['businesses', 'inventories', 'products', 'inventory_states'];
  const before = await Promise.all(
    tables.map((table) => pool.query(`SELECT * FROM ${table}`)),
  );
  const oldJournal = (
    await pool.query('SELECT * FROM drizzle.__drizzle_migrations ORDER BY id')
  ).rows;
  assert.equal(oldJournal.length, 2);
  await migrateDatabase(pool);
  for (let i = 0; i < tables.length; i++) {
    assert.deepEqual(
      (await pool.query(`SELECT * FROM ${tables[i]}`)).rows,
      before[i].rows,
    );
  }
  const newJournal = (
    await pool.query('SELECT * FROM drizzle.__drizzle_migrations ORDER BY id')
  ).rows;
  assert.equal(newJournal.length, 3);
  assert.deepEqual(newJournal.slice(0, 2), oldJournal);
  for (const table of ['user', 'account', 'session', 'verification']) {
    assert.equal((await pool.query(`SELECT id FROM "${table}"`)).rowCount, 0);
  }
  await migrateDatabase(pool);
  assert.deepEqual(
    (await pool.query('SELECT * FROM drizzle.__drizzle_migrations ORDER BY id'))
      .rows,
    newJournal,
  );
});
