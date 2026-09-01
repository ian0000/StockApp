import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';

import { drizzle } from 'drizzle-orm/sqlite-proxy';

import { createSqliteProductRepository } from '../src/infrastructure/sqlite/repositories/repositories';

const TIMESTAMP = 1_776_444_000_000;
const MIGRATION_FILES = [
  '0000_cool_purple_man.sql',
  '0001_confused_naoko.sql',
  '0002_absent_goblin_queen.sql',
  '0003_sparkling_nuke.sql',
] as const;

function openMigratedDatabase(): DatabaseSync {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON;');

  for (const fileName of MIGRATION_FILES) {
    const path = fileURLToPath(
      new URL(`../drizzle/${fileName}`, import.meta.url),
    );
    database.exec(
      readFileSync(path, 'utf8').replaceAll('--> statement-breakpoint', ''),
    );
  }

  return database;
}

function createNodeSqliteDrizzle(database: DatabaseSync) {
  return drizzle(async (sql, params, method) => {
    const statement = database.prepare(sql);

    if (method === 'run') {
      const result = statement.run(...params);
      return Object.assign({ rows: [] }, { changes: Number(result.changes) });
    }

    const rows = statement.all(...params).map((row) => Object.values(row));
    return { rows: method === 'get' ? (rows[0] ?? []) : rows };
  });
}

function seedProducts(database: DatabaseSync): void {
  const insertInventory = database.prepare(
    'INSERT INTO inventories (id, name, currency, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  );
  insertInventory.run('inventory-1', 'Principal', 'USD', TIMESTAMP, TIMESTAMP);
  insertInventory.run('inventory-2', 'Secundario', 'USD', TIMESTAMP, TIMESTAMP);

  const insertProduct = database.prepare(
    'INSERT INTO products (id, inventory_id, name, variant, barcode, regular_sale_price_units, minimum_stock, is_archived, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, 1000000, NULL, ?, ?, ?)',
  );
  insertProduct.run(
    'product-exact',
    'inventory-1',
    'Exacto',
    '0012345',
    0,
    TIMESTAMP,
    TIMESTAMP,
  );
  insertProduct.run(
    'product-partial',
    'inventory-1',
    'Más largo',
    '00123456',
    0,
    TIMESTAMP,
    TIMESTAMP,
  );
  insertProduct.run(
    'product-archived',
    'inventory-1',
    'Archivado',
    '0099999',
    1,
    TIMESTAMP,
    TIMESTAMP,
  );
  insertProduct.run(
    'product-other-inventory',
    'inventory-2',
    'Otro inventario',
    '0012345',
    0,
    TIMESTAMP,
    TIMESTAMP,
  );
}

test('real SQLite barcode lookup is exact, inventory-scoped, active-only, and text-preserving', async () => {
  const database = openMigratedDatabase();

  try {
    seedProducts(database);
    const repository = createSqliteProductRepository(
      createNodeSqliteDrizzle(database) as unknown as Parameters<
        typeof createSqliteProductRepository
      >[0],
    );

    const exact = await repository.findActiveByBarcode(
      'inventory-1',
      '0012345',
    );

    assert.equal(exact?.id, 'product-exact');
    assert.equal(exact?.barcode, '0012345');
    assert.equal(
      await repository.findActiveByBarcode('inventory-1', '001234'),
      null,
    );
    assert.equal(
      await repository.findActiveByBarcode('inventory-1', '12345'),
      null,
    );
    assert.equal(
      await repository.findActiveByBarcode('inventory-1', '0099999'),
      null,
    );
    assert.equal(
      (await repository.findActiveByBarcode('inventory-2', '0012345'))?.id,
      'product-other-inventory',
    );
  } finally {
    database.close();
  }
});
