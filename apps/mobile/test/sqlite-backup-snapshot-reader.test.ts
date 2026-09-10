import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';

import { drizzle } from 'drizzle-orm/sqlite-proxy';

import {
  createBackupSnapshotReader,
  type BackupReadExecutor,
} from '../src/infrastructure/sqlite/backup-snapshot-reader-core';

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

function createNodeSqliteDrizzle(database: DatabaseSync): BackupReadExecutor {
  return drizzle(async (sql, params, method) => {
    const statement = database.prepare(sql);
    const rows = statement.all(...params).map((row) => Object.values(row));
    return { rows: method === 'get' ? (rows[0] ?? []) : rows };
  }) as unknown as BackupReadExecutor;
}

function seedCompleteSnapshot(database: DatabaseSync): void {
  database.exec(`
    INSERT INTO inventories VALUES ('inventory-1', 'Mi Negocio', 'USD', 1, 2);
    INSERT INTO inventories VALUES ('inventory-2', 'Otro', 'USD', 1, 2);

    INSERT INTO products VALUES
      ('product-2', 'inventory-1', 'Archivado', NULL, '0012345678905', 0, NULL, 1, 20, 21),
      ('product-1', 'inventory-1', 'Activo', '500 ml', NULL, 123456789, 2, 0, 10, 11),
      ('other-product', 'inventory-2', 'Otro', NULL, NULL, 1, NULL, 0, 10, 11);

    INSERT INTO inventory_states VALUES
      ('inventory-1', 'product-1', 3, NULL),
      ('inventory-1', 'product-2', -2, 0),
      ('inventory-2', 'other-product', 1, 1);

    INSERT INTO inventory_movements VALUES
      ('movement-1', 'inventory-1', 'product-1', 'INITIAL_STOCK', 3, NULL, 0, 3, NULL, NULL, NULL, 30, 31, 32),
      ('movement-purchase', 'inventory-1', 'product-1', 'PURCHASE', 2, 123456789, 3, 5, 'PURCHASE', 'purchase-confirmed', NULL, 32, 33, 34),
      ('movement-sale', 'inventory-1', 'product-1', 'SALE', -1, 123456789, 5, 4, 'SALE', 'sale-confirmed', NULL, 34, 35, 36),
      ('movement-adjustment-in', 'inventory-1', 'product-1', 'ADJUSTMENT_IN', 1, 123456789, 4, 5, 'STOCK_ADJUSTMENT', 'adjustment-1', NULL, 36, 37, 38),
      ('movement-adjustment-out', 'inventory-1', 'product-1', 'ADJUSTMENT_OUT', -2, 123456789, 5, 3, 'STOCK_ADJUSTMENT', 'adjustment-2', NULL, 38, 39, 40),
      ('movement-2', 'inventory-1', 'product-2', 'REVERSAL', 1, 0, -3, -2, 'INVENTORY_MOVEMENT', 'movement-original', '{"futureCompatible":true}', 40, 41, 42),
      ('other-movement', 'inventory-2', 'other-product', 'INITIAL_STOCK', 1, 1, 0, 1, NULL, NULL, NULL, 30, 31, 32);

    INSERT INTO sales VALUES
      ('sale-1', 'inventory-1', 50, 51, 52, 'VOIDED', 1250000, NULL, NULL, NULL),
      ('sale-confirmed', 'inventory-1', 52, 53, 54, 'CONFIRMED', 1250000, 300000, 950000, 'Dos productos'),
      ('other-sale', 'inventory-2', 50, 51, 52, 'CONFIRMED', 1, 1, 0, NULL);
    INSERT INTO sale_items VALUES
      ('sale-item-1', 'sale-1', 'product-1', 1, 1250000, 1250000, NULL, NULL, NULL, 'UNKNOWN', 51, 52),
      ('sale-item-2', 'sale-confirmed', 'product-1', 1, 500000, 500000, 100000, 100000, 400000, 'KNOWN', 53, 54),
      ('sale-item-3', 'sale-confirmed', 'product-2', 1, 750000, 750000, 200000, 200000, 550000, 'KNOWN', 53, 54),
      ('other-sale-item', 'other-sale', 'other-product', 1, 1, 1, 1, 1, 0, 'KNOWN', 51, 52);

    INSERT INTO purchases VALUES
      ('purchase-1', 'inventory-1', 'product-2', 2, 0, 0, 60, 61, 62, 'VOIDED', 'Prueba', NULL, 0, -4, -2),
      ('purchase-confirmed', 'inventory-1', 'product-1', 2, 123456789, 246913578, 62, 63, 64, 'CONFIRMED', NULL, 123456789, 123456789, 3, 5),
      ('other-purchase', 'inventory-2', 'other-product', 1, 1, 1, 60, 61, 62, 'CONFIRMED', NULL, 1, 1, 0, 1);

    INSERT INTO stock_adjustments VALUES
      ('adjustment-1', 'inventory-1', 'product-1', 2, 3, 1, 'COUNT_CORRECTION', 'CUSTOM_COST', 700000, 70, 71, 72),
      ('adjustment-2', 'inventory-1', 'product-1', 5, 3, -2, 'DAMAGED', NULL, 123456789, 72, 73, 74),
      ('other-adjustment', 'inventory-2', 'other-product', 0, 1, 1, 'COUNT_CORRECTION', 'CUSTOM_COST', 1, 70, 71, 72);
  `);
}

test('reads all eight collections for one inventory in exactly one transaction', async () => {
  const database = openMigratedDatabase();
  seedCompleteSnapshot(database);
  let transactionCalls = 0;
  const reader = createBackupSnapshotReader(async (operation) => {
    transactionCalls += 1;
    database.exec('BEGIN;');
    try {
      const result = await operation(createNodeSqliteDrizzle(database));
      database.exec('COMMIT;');
      return result;
    } catch (error) {
      database.exec('ROLLBACK;');
      throw error;
    }
  });

  try {
    const snapshot = await reader.readSnapshot('inventory-1');

    assert.equal(transactionCalls, 1);
    assert.deepEqual(
      snapshot.inventories.map(({ id }) => id),
      ['inventory-1'],
    );
    assert.deepEqual(
      snapshot.products.map(({ id }) => id),
      ['product-1', 'product-2'],
    );
    assert.equal(snapshot.products[1]?.isArchived, true);
    assert.equal(snapshot.products[1]?.barcode, '0012345678905');
    assert.equal(snapshot.products[0]?.regularSalePriceUnits, 123_456_789);
    assert.equal(snapshot.inventoryStates[0]?.unitCostUnits, null);
    assert.equal(snapshot.inventoryStates[1]?.unitCostUnits, 0);
    assert.equal(snapshot.inventoryStates[1]?.stock, -2);
    assert.deepEqual(
      snapshot.inventoryMovements.map(({ type }) => type),
      [
        'INITIAL_STOCK',
        'PURCHASE',
        'SALE',
        'ADJUSTMENT_IN',
        'ADJUSTMENT_OUT',
        'REVERSAL',
      ],
    );
    assert.equal(
      snapshot.inventoryMovements[5]?.metadata,
      '{"futureCompatible":true}',
    );
    assert.deepEqual(
      snapshot.sales.map(({ status }) => status),
      ['VOIDED', 'CONFIRMED'],
    );
    assert.deepEqual(
      snapshot.saleItems.map(({ id }) => id),
      ['sale-item-1', 'sale-item-2', 'sale-item-3'],
    );
    assert.deepEqual(
      snapshot.purchases.map(({ status }) => status),
      ['VOIDED', 'CONFIRMED'],
    );
    assert.deepEqual(
      snapshot.stockAdjustments.map(({ id }) => id),
      ['adjustment-1', 'adjustment-2'],
    );
  } finally {
    database.close();
  }
});

test('rolls back and propagates a read failure without retrying the transaction', async () => {
  const failure = new Error('read failed');
  let calls = 0;
  const reader = createBackupSnapshotReader(async () => {
    calls += 1;
    throw failure;
  });

  await assert.rejects(reader.readSnapshot('inventory-1'), failure);
  assert.equal(calls, 1);
});
