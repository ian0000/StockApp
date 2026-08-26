import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';

const MIGRATION_FILES = [
  '0000_cool_purple_man.sql',
  '0001_confused_naoko.sql',
  '0002_absent_goblin_queen.sql',
  '0003_sparkling_nuke.sql',
] as const;
const TIMESTAMP = 1_776_444_000_000;

interface StockAdjustmentSqlInput {
  readonly id: string;
  readonly inventoryId: string;
  readonly productId: string;
  readonly stockBefore: number;
  readonly actualStock: number;
  readonly difference: number;
  readonly reason: string;
  readonly costMode: string | null;
  readonly unitCostUnits: number | null;
  readonly effectiveAt: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

function drizzleFilePath(fileName: string): string {
  return fileURLToPath(new URL(`../drizzle/${fileName}`, import.meta.url));
}

function readMigration(fileName: (typeof MIGRATION_FILES)[number]): string {
  return readFileSync(drizzleFilePath(fileName), 'utf8').replaceAll(
    '--> statement-breakpoint',
    '',
  );
}

function applyMigrations(database: DatabaseSync, count: number): void {
  for (const fileName of MIGRATION_FILES.slice(0, count)) {
    database.exec(readMigration(fileName));
  }
}

function openTestDatabase(): DatabaseSync {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON;');

  return database;
}

function scalarCount(database: DatabaseSync, tableName: string): number {
  const result = database
    .prepare(`SELECT count(*) AS count FROM ${tableName}`)
    .get() as { readonly count: number };

  return result.count;
}

function seedInventoryAndProduct(database: DatabaseSync): void {
  database
    .prepare(
      `INSERT INTO inventories (
        id, name, currency, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?)`,
    )
    .run('inventory-a', 'Existing inventory', 'USD', TIMESTAMP, TIMESTAMP);
  database
    .prepare(
      `INSERT INTO products (
        id, inventory_id, name, variant, barcode,
        regular_sale_price_units, minimum_stock, is_archived,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      'product-a',
      'inventory-a',
      'Existing product',
      null,
      '00123',
      1_750_000,
      1,
      0,
      TIMESTAMP,
      TIMESTAMP,
    );
}

function seedPopulatedDatabaseThrough0002(database: DatabaseSync): void {
  applyMigrations(database, 3);
  seedInventoryAndProduct(database);

  database
    .prepare(
      `INSERT INTO inventory_states (
        inventory_id, product_id, stock, unit_cost_units
      ) VALUES (?, ?, ?, ?)`,
    )
    .run('inventory-a', 'product-a', 13, 815_385);
  database
    .prepare(
      `INSERT INTO inventory_movements (
        id, inventory_id, product_id, type, quantity_delta,
        unit_cost_snapshot_units, stock_before, stock_after,
        source_type, source_id, metadata,
        effective_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      'movement-initial',
      'inventory-a',
      'product-a',
      'INITIAL_STOCK',
      10,
      700_000,
      0,
      10,
      null,
      null,
      null,
      TIMESTAMP,
      TIMESTAMP,
      TIMESTAMP,
    );
  database
    .prepare(
      `INSERT INTO sales (
        id, inventory_id, effective_at, created_at, updated_at,
        status, total_amount_units, estimated_cost_units,
        estimated_profit_units, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      'sale-existing',
      'inventory-a',
      TIMESTAMP + 1,
      TIMESTAMP + 1,
      TIMESTAMP + 1,
      'CONFIRMED',
      2_000_000,
      1_400_000,
      600_000,
      null,
    );
  database
    .prepare(
      `INSERT INTO sale_items (
        id, sale_id, product_id, quantity,
        unit_sale_price_units, subtotal_units,
        unit_cost_snapshot_units, estimated_cost_units,
        estimated_profit_units, cost_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      'sale-item-existing',
      'sale-existing',
      'product-a',
      2,
      1_000_000,
      2_000_000,
      700_000,
      1_400_000,
      600_000,
      'KNOWN',
      TIMESTAMP + 1,
      TIMESTAMP + 1,
    );
  database
    .prepare(
      `INSERT INTO inventory_movements (
        id, inventory_id, product_id, type, quantity_delta,
        unit_cost_snapshot_units, stock_before, stock_after,
        source_type, source_id, metadata,
        effective_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      'movement-sale',
      'inventory-a',
      'product-a',
      'SALE',
      -2,
      700_000,
      10,
      8,
      'SALE',
      'sale-existing',
      null,
      TIMESTAMP + 1,
      TIMESTAMP + 1,
      TIMESTAMP + 1,
    );
  database
    .prepare(
      `INSERT INTO purchases (
        id, inventory_id, product_id, quantity,
        unit_cost_units, total_amount_units,
        effective_at, created_at, updated_at,
        status, notes, average_cost_before_units,
        average_cost_after_units, stock_before, stock_after
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      'purchase-existing',
      'inventory-a',
      'product-a',
      5,
      1_000_000,
      5_000_000,
      TIMESTAMP + 2,
      TIMESTAMP + 2,
      TIMESTAMP + 2,
      'CONFIRMED',
      null,
      700_000,
      815_385,
      8,
      13,
    );
  database
    .prepare(
      `INSERT INTO inventory_movements (
        id, inventory_id, product_id, type, quantity_delta,
        unit_cost_snapshot_units, stock_before, stock_after,
        source_type, source_id, metadata,
        effective_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      'movement-purchase',
      'inventory-a',
      'product-a',
      'PURCHASE',
      5,
      1_000_000,
      8,
      13,
      'PURCHASE',
      'purchase-existing',
      null,
      TIMESTAMP + 2,
      TIMESTAMP + 2,
      TIMESTAMP + 2,
    );
}

function validAdjustment(
  overrides: Partial<StockAdjustmentSqlInput> = {},
): StockAdjustmentSqlInput {
  return {
    id: 'adjustment-valid',
    inventoryId: 'inventory-a',
    productId: 'product-a',
    stockBefore: 10,
    actualStock: 15,
    difference: 5,
    reason: 'COUNT_CORRECTION',
    costMode: 'CUSTOM_COST',
    unitCostUnits: 4_000_000,
    effectiveAt: TIMESTAMP,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

function insertAdjustment(
  database: DatabaseSync,
  overrides: Partial<StockAdjustmentSqlInput> = {},
): void {
  const adjustment = validAdjustment(overrides);

  database
    .prepare(
      `INSERT INTO stock_adjustments (
        id, inventory_id, product_id,
        stock_before, actual_stock, difference,
        reason, cost_mode, unit_cost_units,
        effective_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      adjustment.id,
      adjustment.inventoryId,
      adjustment.productId,
      adjustment.stockBefore,
      adjustment.actualStock,
      adjustment.difference,
      adjustment.reason,
      adjustment.costMode,
      adjustment.unitCostUnits,
      adjustment.effectiveAt,
      adjustment.createdAt,
      adjustment.updatedAt,
    );
}

test('upgrades a populated 0000-0002 database without losing existing data', () => {
  const database = openTestDatabase();

  try {
    seedPopulatedDatabaseThrough0002(database);
    database.exec(readMigration('0003_sparkling_nuke.sql'));

    assert.equal(scalarCount(database, 'inventories'), 1);
    assert.equal(scalarCount(database, 'products'), 1);
    assert.equal(scalarCount(database, 'inventory_states'), 1);
    assert.equal(scalarCount(database, 'inventory_movements'), 3);
    assert.equal(scalarCount(database, 'sales'), 1);
    assert.equal(scalarCount(database, 'sale_items'), 1);
    assert.equal(scalarCount(database, 'purchases'), 1);
    assert.equal(scalarCount(database, 'stock_adjustments'), 0);
    assert.deepEqual(
      {
        ...(database
          .prepare(
            `SELECT stock, unit_cost_units
             FROM inventory_states
             WHERE inventory_id = ? AND product_id = ?`,
          )
          .get('inventory-a', 'product-a') as {
          readonly stock: number;
          readonly unit_cost_units: number;
        }),
      },
      { stock: 13, unit_cost_units: 815_385 },
    );
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    database.close();
  }
});

test('fresh install creates exactly the eight application tables', () => {
  const database = openTestDatabase();

  try {
    applyMigrations(database, 4);

    const tables = database
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
         ORDER BY name`,
      )
      .all()
      .map((row) => (row as { readonly name: string }).name);

    assert.deepEqual(tables, [
      'inventories',
      'inventory_movements',
      'inventory_states',
      'products',
      'purchases',
      'sale_items',
      'sales',
      'stock_adjustments',
    ]);
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    database.close();
  }
});

test('SQLite accepts every approved StockAdjustment shape', () => {
  const database = openTestDatabase();

  try {
    applyMigrations(database, 4);
    seedInventoryAndProduct(database);

    insertAdjustment(database);
    insertAdjustment(database, {
      id: 'adjustment-current-cost',
      costMode: 'USE_CURRENT_COST',
      unitCostUnits: 2_000_000,
    });
    insertAdjustment(database, {
      id: 'adjustment-zero-cost',
      reason: 'OTHER',
      unitCostUnits: 0,
    });
    insertAdjustment(database, {
      id: 'adjustment-from-negative',
      stockBefore: -2,
      actualStock: 3,
      difference: 5,
      unitCostUnits: 3_000_000,
    });
    insertAdjustment(database, {
      id: 'adjustment-negative',
      stockBefore: 10,
      actualStock: 7,
      difference: -3,
      reason: 'DAMAGED',
      costMode: null,
      unitCostUnits: 2_000_000,
    });
    insertAdjustment(database, {
      id: 'adjustment-actual-zero',
      stockBefore: 5,
      actualStock: 0,
      difference: -5,
      reason: 'LOST',
      costMode: null,
      unitCostUnits: 0,
      effectiveAt: TIMESTAMP - 1,
    });

    assert.equal(scalarCount(database, 'stock_adjustments'), 6);
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    database.close();
  }
});

test('SQLite rejects every approved StockAdjustment structural violation', () => {
  const database = openTestDatabase();

  try {
    applyMigrations(database, 4);
    seedInventoryAndProduct(database);

    const invalidRows: readonly Partial<StockAdjustmentSqlInput>[] = [
      { actualStock: 10, difference: 0 },
      { actualStock: -1, difference: -11 },
      { actualStock: 15, difference: 4 },
      { reason: 'DAMAGED' },
      { reason: 'LOST' },
      { reason: 'INTERNAL_USE' },
      { reason: 'INVALID' },
      { costMode: null },
      { unitCostUnits: null },
      {
        actualStock: 7,
        difference: -3,
        reason: 'DAMAGED',
        costMode: 'USE_CURRENT_COST',
      },
      {
        actualStock: 7,
        difference: -3,
        reason: 'DAMAGED',
        costMode: 'CUSTOM_COST',
      },
      { costMode: 'AVERAGE' },
      { unitCostUnits: -1 },
      {
        actualStock: 7,
        difference: -3,
        reason: 'DAMAGED',
        costMode: null,
        unitCostUnits: null,
      },
      { effectiveAt: -1 },
      { createdAt: -1 },
      { updatedAt: -1 },
      { updatedAt: TIMESTAMP - 1 },
    ];

    for (const invalidRow of invalidRows) {
      assert.throws(
        () => insertAdjustment(database, invalidRow),
        /constraint failed/i,
      );
    }

    assert.equal(scalarCount(database, 'stock_adjustments'), 0);
  } finally {
    database.close();
  }
});

test('composite StockAdjustment foreign key enforces Inventory and Product ownership', () => {
  const database = openTestDatabase();

  try {
    applyMigrations(database, 4);
    seedInventoryAndProduct(database);
    database
      .prepare(
        `INSERT INTO inventories (
          id, name, currency, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?)`,
      )
      .run('inventory-b', 'Other inventory', 'USD', TIMESTAMP, TIMESTAMP);

    insertAdjustment(database, { id: 'adjustment-matching-product' });
    assert.throws(
      () =>
        insertAdjustment(database, {
          id: 'adjustment-cross-inventory',
          inventoryId: 'inventory-b',
        }),
      /foreign key constraint failed/i,
    );
    assert.throws(
      () =>
        insertAdjustment(database, {
          id: 'adjustment-missing-product',
          productId: 'missing-product',
        }),
      /foreign key constraint failed/i,
    );
    assert.equal(scalarCount(database, 'stock_adjustments'), 1);
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    database.close();
  }
});

test('generated metadata and Expo registry contain ordered 0000-0003 migrations', () => {
  const journal = JSON.parse(
    readFileSync(drizzleFilePath('meta/_journal.json'), 'utf8'),
  ) as {
    readonly dialect: string;
    readonly entries: readonly {
      readonly idx: number;
      readonly tag: string;
    }[];
  };
  const previousSnapshot = JSON.parse(
    readFileSync(drizzleFilePath('meta/0002_snapshot.json'), 'utf8'),
  ) as { readonly id: string };
  const currentSnapshot = JSON.parse(
    readFileSync(drizzleFilePath('meta/0003_snapshot.json'), 'utf8'),
  ) as {
    readonly dialect: string;
    readonly prevId: string;
  };
  const registry = readFileSync(drizzleFilePath('migrations.js'), 'utf8');
  const migrationSql = readMigration('0003_sparkling_nuke.sql');

  assert.equal(journal.dialect, 'sqlite');
  assert.deepEqual(
    journal.entries.map(({ idx, tag }) => ({ idx, tag })),
    [
      { idx: 0, tag: '0000_cool_purple_man' },
      { idx: 1, tag: '0001_confused_naoko' },
      { idx: 2, tag: '0002_absent_goblin_queen' },
      { idx: 3, tag: '0003_sparkling_nuke' },
    ],
  );
  assert.equal(currentSnapshot.dialect, 'sqlite');
  assert.equal(currentSnapshot.prevId, previousSnapshot.id);
  assert.match(registry, /import m0003 from '.\/0003_sparkling_nuke\.sql'/);
  assert.match(registry, /m0003/);
  assert.match(migrationSql, /CREATE TABLE `stock_adjustments`/);
  assert.doesNotMatch(migrationSql, /\breal\b|\bfloat\b/i);
});
