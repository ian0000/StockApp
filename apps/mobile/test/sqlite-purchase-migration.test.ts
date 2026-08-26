import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';

const MIGRATION_FILES = [
  '0000_cool_purple_man.sql',
  '0001_confused_naoko.sql',
  '0002_absent_goblin_queen.sql',
] as const;
const TIMESTAMP = 1_776_444_000_000;

interface PurchaseSqlInput {
  readonly id: string;
  readonly inventoryId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly unitCostUnits: number;
  readonly totalAmountUnits: number;
  readonly effectiveAt: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly status: string;
  readonly notes: string | null;
  readonly averageCostBeforeUnits: number | null;
  readonly averageCostAfterUnits: number;
  readonly stockBefore: number;
  readonly stockAfter: number;
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

function insertInventoryAndProduct(
  database: DatabaseSync,
  inventoryId = 'inventory-a',
  productId = 'product-a',
): void {
  database
    .prepare(
      `INSERT INTO inventories (
        id, name, currency, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?)`,
    )
    .run(inventoryId, 'Existing inventory', 'USD', TIMESTAMP, TIMESTAMP);
  database
    .prepare(
      `INSERT INTO products (
        id, inventory_id, name, variant, barcode,
        regular_sale_price_units, minimum_stock, is_archived,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      productId,
      inventoryId,
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

function validPurchase(
  overrides: Partial<PurchaseSqlInput> = {},
): PurchaseSqlInput {
  return {
    id: 'purchase-valid',
    inventoryId: 'inventory-a',
    productId: 'product-a',
    quantity: 10,
    unitCostUnits: 12_000_000,
    totalAmountUnits: 120_000_000,
    effectiveAt: TIMESTAMP,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    status: 'CONFIRMED',
    notes: null,
    averageCostBeforeUnits: 10_000_000,
    averageCostAfterUnits: 10_666_667,
    stockBefore: 20,
    stockAfter: 30,
    ...overrides,
  };
}

function insertPurchase(
  database: DatabaseSync,
  overrides: Partial<PurchaseSqlInput> = {},
): void {
  const purchase = validPurchase(overrides);

  database
    .prepare(
      `INSERT INTO purchases (
        id, inventory_id, product_id, quantity,
        unit_cost_units, total_amount_units,
        effective_at, created_at, updated_at,
        status, notes,
        average_cost_before_units, average_cost_after_units,
        stock_before, stock_after
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      purchase.id,
      purchase.inventoryId,
      purchase.productId,
      purchase.quantity,
      purchase.unitCostUnits,
      purchase.totalAmountUnits,
      purchase.effectiveAt,
      purchase.createdAt,
      purchase.updatedAt,
      purchase.status,
      purchase.notes,
      purchase.averageCostBeforeUnits,
      purchase.averageCostAfterUnits,
      purchase.stockBefore,
      purchase.stockAfter,
    );
}

function scalarCount(database: DatabaseSync, tableName: string): number {
  const result = database
    .prepare(`SELECT count(*) AS count FROM ${tableName}`)
    .get() as { readonly count: number };

  return result.count;
}

test('upgrades a populated 0000+0001 database and preserves all existing data', () => {
  const database = openTestDatabase();

  try {
    applyMigrations(database, 2);
    insertInventoryAndProduct(database);
    database
      .prepare(
        `INSERT INTO inventory_states (
          inventory_id, product_id, stock, unit_cost_units
        ) VALUES (?, ?, ?, ?)`,
      )
      .run('inventory-a', 'product-a', 10, 700_000);
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
        `UPDATE inventory_states
         SET stock = ?
         WHERE inventory_id = ? AND product_id = ?`,
      )
      .run(8, 'inventory-a', 'product-a');

    database.exec(readMigration('0002_absent_goblin_queen.sql'));

    assert.equal(scalarCount(database, 'inventories'), 1);
    assert.equal(scalarCount(database, 'products'), 1);
    assert.equal(scalarCount(database, 'inventory_states'), 1);
    assert.equal(scalarCount(database, 'inventory_movements'), 2);
    assert.equal(scalarCount(database, 'sales'), 1);
    assert.equal(scalarCount(database, 'sale_items'), 1);
    assert.equal(scalarCount(database, 'purchases'), 0);
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
      { stock: 8, unit_cost_units: 700_000 },
    );
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    database.close();
  }
});

test('fresh install creates exactly the seven application tables', () => {
  const database = openTestDatabase();

  try {
    applyMigrations(database, 3);

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
    ]);
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    database.close();
  }
});

test('SQLite accepts all approved positive, zero and negative-stock Purchase snapshots', () => {
  const database = openTestDatabase();

  try {
    applyMigrations(database, 3);
    insertInventoryAndProduct(database);

    insertPurchase(database);
    insertPurchase(database, {
      id: 'purchase-zero-cost',
      quantity: 5,
      unitCostUnits: 0,
      totalAmountUnits: 0,
      averageCostBeforeUnits: null,
      averageCostAfterUnits: 0,
      stockBefore: 0,
      stockAfter: 5,
    });
    insertPurchase(database, {
      id: 'purchase-zero-stock-known-before',
      quantity: 5,
      unitCostUnits: 2_000_000,
      totalAmountUnits: 10_000_000,
      averageCostBeforeUnits: 1_500_000,
      averageCostAfterUnits: 2_000_000,
      stockBefore: 0,
      stockAfter: 5,
    });
    insertPurchase(database, {
      id: 'purchase-negative-remains-negative',
      quantity: 4,
      unitCostUnits: 2_000_000,
      totalAmountUnits: 8_000_000,
      averageCostBeforeUnits: null,
      averageCostAfterUnits: 2_000_000,
      stockBefore: -10,
      stockAfter: -6,
    });
    insertPurchase(database, {
      id: 'purchase-negative-becomes-positive',
      quantity: 15,
      unitCostUnits: 2_000_000,
      totalAmountUnits: 30_000_000,
      averageCostBeforeUnits: 1_500_000,
      averageCostAfterUnits: 2_000_000,
      stockBefore: -10,
      stockAfter: 5,
    });

    assert.equal(scalarCount(database, 'purchases'), 5);
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    database.close();
  }
});

test('SQLite rejects every approved Purchase structural invariant violation', () => {
  const database = openTestDatabase();

  try {
    applyMigrations(database, 3);
    insertInventoryAndProduct(database);

    const invalidRows: readonly Partial<PurchaseSqlInput>[] = [
      { quantity: 0 },
      { quantity: -1, stockAfter: 19 },
      { unitCostUnits: -1 },
      { totalAmountUnits: -1 },
      { status: 'PENDING' },
      { effectiveAt: -1 },
      { createdAt: -1 },
      { updatedAt: -1 },
      { createdAt: TIMESTAMP, updatedAt: TIMESTAMP - 1 },
      { stockBefore: 20, averageCostBeforeUnits: null },
      { averageCostBeforeUnits: -1 },
      { averageCostAfterUnits: -1 },
      { stockAfter: 29 },
      {
        stockBefore: 0,
        stockAfter: 10,
        averageCostAfterUnits: 11_000_000,
      },
      {
        stockBefore: -3,
        stockAfter: 7,
        averageCostAfterUnits: 11_000_000,
      },
    ];

    for (const invalidRow of invalidRows) {
      assert.throws(
        () => insertPurchase(database, invalidRow),
        /constraint failed/i,
      );
    }

    assert.equal(scalarCount(database, 'purchases'), 0);
  } finally {
    database.close();
  }
});

test('composite Purchase foreign key rejects a Product from another Inventory', () => {
  const database = openTestDatabase();

  try {
    applyMigrations(database, 3);
    insertInventoryAndProduct(database);
    database
      .prepare(
        `INSERT INTO inventories (
          id, name, currency, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?)`,
      )
      .run('inventory-b', 'Other inventory', 'USD', TIMESTAMP, TIMESTAMP);

    assert.throws(
      () => insertPurchase(database, { inventoryId: 'inventory-b' }),
      /foreign key constraint failed/i,
    );
    assert.throws(
      () => insertPurchase(database, { productId: 'missing-product' }),
      /foreign key constraint failed/i,
    );
    assert.equal(scalarCount(database, 'purchases'), 0);
  } finally {
    database.close();
  }
});

test('generated migration metadata and Expo registry contain ordered 0000-0002 entries', () => {
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
    readFileSync(drizzleFilePath('meta/0001_snapshot.json'), 'utf8'),
  ) as { readonly id: string };
  const currentSnapshot = JSON.parse(
    readFileSync(drizzleFilePath('meta/0002_snapshot.json'), 'utf8'),
  ) as {
    readonly dialect: string;
    readonly prevId: string;
  };
  const registry = readFileSync(drizzleFilePath('migrations.js'), 'utf8');
  const migrationSql = readMigration('0002_absent_goblin_queen.sql');

  assert.equal(journal.dialect, 'sqlite');
  assert.deepEqual(
    journal.entries.slice(0, 3).map(({ idx, tag }) => ({ idx, tag })),
    [
      { idx: 0, tag: '0000_cool_purple_man' },
      { idx: 1, tag: '0001_confused_naoko' },
      { idx: 2, tag: '0002_absent_goblin_queen' },
    ],
  );
  assert.equal(currentSnapshot.dialect, 'sqlite');
  assert.equal(currentSnapshot.prevId, previousSnapshot.id);
  assert.match(
    registry,
    /import m0002 from '.\/0002_absent_goblin_queen\.sql'/,
  );
  assert.match(registry, /m0002/);
  assert.doesNotMatch(migrationSql, /\breal\b|\bfloat\b/i);
});
