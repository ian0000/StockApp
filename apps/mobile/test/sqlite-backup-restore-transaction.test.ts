import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';

import {
  GetCurrentInventoryUseCase,
  GetProductDetailsUseCase,
  GetPurchaseDetailsUseCase,
  GetSaleDetailsUseCase,
  GetSalesSummaryUseCase,
  GetTopSellingProductUseCase,
  ListHistoryUseCase,
  ListProductsUseCase,
  type BackupDataV1,
} from '@stock-app/application';
import { drizzle } from 'drizzle-orm/sqlite-proxy';

import {
  createBackupRestoreTransaction,
  type BackupRestoreExecutor,
  type BackupRestorePhase,
} from '../src/infrastructure/sqlite/backup-restore-transaction';
import {
  createBackupSnapshotReader,
  type BackupReadExecutor,
} from '../src/infrastructure/sqlite/backup-snapshot-reader';
import {
  createInventoryRepository,
  createSqliteHistoryReader,
  createSqliteInventoryStateRepository,
  createSqliteProductRepository,
  createSqlitePurchaseDetailsReader,
  createSqliteSaleDetailsReader,
  createSqliteSalesSummaryReader,
  createSqliteTopSellingProductReader,
} from '../src/infrastructure/sqlite/repositories/repositories';

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

function createRunner(database: DatabaseSync, failCommit = false) {
  return async (
    operation: (executor: BackupRestoreExecutor) => Promise<void>,
  ): Promise<void> => {
    database.exec('BEGIN IMMEDIATE;');
    try {
      await operation(
        createNodeSqliteDrizzle(database) as unknown as BackupRestoreExecutor,
      );
      if (failCommit) throw new Error('finalization failed');
      database.exec('COMMIT;');
    } catch (error) {
      database.exec('ROLLBACK;');
      throw error;
    }
  };
}

function seedLocalData(database: DatabaseSync): void {
  database.exec(`
    INSERT INTO inventories VALUES ('local-inventory', 'Local', 'USD', 1, 1);
    INSERT INTO products VALUES
      ('local-product', 'local-inventory', 'Local product', NULL, NULL, 1000000, NULL, 0, 2, 2);
    INSERT INTO inventory_states VALUES
      ('local-inventory', 'local-product', 1, 500000);
    INSERT INTO inventory_movements VALUES
      ('local-movement', 'local-inventory', 'local-product', 'INITIAL_STOCK', 1, 500000, 0, 1, NULL, NULL, NULL, 2, 2, 2);
  `);
}

function restoredData(): BackupDataV1 {
  return {
    inventories: [
      {
        id: 'restored-inventory',
        name: 'Restored',
        currency: 'USD',
        createdAt: 10,
        updatedAt: 11,
      },
    ],
    products: [
      {
        id: 'product-active',
        inventoryId: 'restored-inventory',
        name: 'Active',
        variant: '500 ml',
        barcode: '0012345',
        regularSalePriceUnits: 1_000_000,
        minimumStock: 2,
        isArchived: false,
        createdAt: 20,
        updatedAt: 21,
      },
      {
        id: 'product-archived',
        inventoryId: 'restored-inventory',
        name: 'Archived',
        variant: null,
        barcode: '0012345',
        regularSalePriceUnits: 0,
        minimumStock: null,
        isArchived: true,
        createdAt: 22,
        updatedAt: 23,
      },
    ],
    inventoryStates: [
      {
        inventoryId: 'restored-inventory',
        productId: 'product-active',
        stock: 12,
        unitCostUnits: 800_000,
      },
      {
        inventoryId: 'restored-inventory',
        productId: 'product-archived',
        stock: -1,
        unitCostUnits: null,
      },
    ],
    inventoryMovements: [
      {
        id: 'movement-initial',
        inventoryId: 'restored-inventory',
        productId: 'product-active',
        type: 'INITIAL_STOCK',
        quantityDelta: 10,
        unitCostSnapshotUnits: 700_000,
        stockBefore: 0,
        stockAfter: 10,
        sourceType: null,
        sourceId: null,
        metadata: null,
        effectiveAt: 30,
        createdAt: 30,
        updatedAt: 30,
      },
      {
        id: 'movement-purchase',
        inventoryId: 'restored-inventory',
        productId: 'product-active',
        type: 'PURCHASE',
        quantityDelta: 2,
        unitCostSnapshotUnits: 800_000,
        stockBefore: 10,
        stockAfter: 12,
        sourceType: 'PURCHASE',
        sourceId: 'purchase-1',
        metadata: null,
        effectiveAt: 40,
        createdAt: 40,
        updatedAt: 40,
      },
      {
        id: 'movement-sale',
        inventoryId: 'restored-inventory',
        productId: 'product-active',
        type: 'SALE',
        quantityDelta: -2,
        unitCostSnapshotUnits: 700_000,
        stockBefore: 12,
        stockAfter: 10,
        sourceType: 'SALE',
        sourceId: 'sale-1',
        metadata: '{"kept":true}',
        effectiveAt: 50,
        createdAt: 50,
        updatedAt: 50,
      },
      {
        id: 'movement-adjustment',
        inventoryId: 'restored-inventory',
        productId: 'product-active',
        type: 'ADJUSTMENT_IN',
        quantityDelta: 2,
        unitCostSnapshotUnits: 900_000,
        stockBefore: 10,
        stockAfter: 12,
        sourceType: 'STOCK_ADJUSTMENT',
        sourceId: 'adjustment-1',
        metadata: null,
        effectiveAt: 60,
        createdAt: 60,
        updatedAt: 60,
      },
      {
        id: 'movement-reversal',
        inventoryId: 'restored-inventory',
        productId: 'product-active',
        type: 'REVERSAL',
        quantityDelta: 2,
        unitCostSnapshotUnits: 700_000,
        stockBefore: 10,
        stockAfter: 12,
        sourceType: 'INVENTORY_MOVEMENT',
        sourceId: 'movement-sale',
        metadata: null,
        effectiveAt: 70,
        createdAt: 70,
        updatedAt: 70,
      },
    ],
    sales: [
      {
        id: 'sale-1',
        inventoryId: 'restored-inventory',
        effectiveAt: 50,
        createdAt: 50,
        updatedAt: 70,
        status: 'VOIDED',
        totalAmountUnits: 2_000_000,
        estimatedCostUnits: 1_400_000,
        estimatedProfitUnits: 600_000,
        notes: null,
      },
    ],
    saleItems: [
      {
        id: 'sale-item-1',
        saleId: 'sale-1',
        productId: 'product-active',
        quantity: 2,
        unitSalePriceUnits: 1_000_000,
        subtotalUnits: 2_000_000,
        unitCostSnapshotUnits: 700_000,
        estimatedCostUnits: 1_400_000,
        estimatedProfitUnits: 600_000,
        costStatus: 'KNOWN',
        createdAt: 50,
        updatedAt: 50,
      },
    ],
    purchases: [
      {
        id: 'purchase-1',
        inventoryId: 'restored-inventory',
        productId: 'product-active',
        quantity: 2,
        unitCostUnits: 800_000,
        totalAmountUnits: 1_600_000,
        effectiveAt: 40,
        createdAt: 40,
        updatedAt: 40,
        status: 'CONFIRMED',
        notes: 'Exact',
        averageCostBeforeUnits: 700_000,
        averageCostAfterUnits: 716_667,
        stockBefore: 10,
        stockAfter: 12,
      },
    ],
    stockAdjustments: [
      {
        id: 'adjustment-1',
        inventoryId: 'restored-inventory',
        productId: 'product-active',
        stockBefore: 10,
        actualStock: 12,
        difference: 2,
        reason: 'COUNT_CORRECTION',
        costMode: 'CUSTOM_COST',
        unitCostUnits: 900_000,
        effectiveAt: 60,
        createdAt: 60,
        updatedAt: 60,
      },
    ],
  };
}

async function readSnapshot(
  database: DatabaseSync,
  inventoryId: string,
): Promise<BackupDataV1> {
  const reader = createBackupSnapshotReader(async (operation) =>
    operation(
      createNodeSqliteDrizzle(database) as unknown as BackupReadExecutor,
    ),
  );
  return reader.readSnapshot(inventoryId);
}

function localFingerprint(database: DatabaseSync): unknown {
  return {
    inventories: database.prepare('SELECT * FROM inventories').all(),
    products: database.prepare('SELECT * FROM products').all(),
    states: database.prepare('SELECT * FROM inventory_states').all(),
    movements: database.prepare('SELECT * FROM inventory_movements').all(),
  };
}

test('atomically replaces local rows in foreign-key-safe delete and insert order', async () => {
  const database = openMigratedDatabase();
  seedLocalData(database);
  const transaction = createBackupRestoreTransaction(createRunner(database));

  try {
    await transaction.replace(restoredData());

    assert.deepEqual(
      database
        .prepare('SELECT id FROM inventories')
        .all()
        .map((row) => row.id),
      ['restored-inventory'],
    );
    assert.equal(database.prepare('PRAGMA foreign_key_check').all().length, 0);
    assert.deepEqual(
      await readSnapshot(database, 'restored-inventory'),
      restoredData(),
    );
  } finally {
    database.close();
  }
});

const FAILURE_PHASES: readonly BackupRestorePhase[] = [
  'after-delete',
  'after-inventories',
  'after-products',
  'after-inventory-states',
  'after-sales',
  'after-sale-items',
  'after-purchases',
  'after-stock-adjustments',
  'after-inventory-movements',
];

for (const failurePhase of FAILURE_PHASES) {
  test(`rolls back the original database when restore fails at ${failurePhase}`, async () => {
    const database = openMigratedDatabase();
    seedLocalData(database);
    const before = localFingerprint(database);
    const transaction = createBackupRestoreTransaction(
      createRunner(database),
      (phase) => {
        if (phase === failurePhase) throw new Error(`failed ${phase}`);
      },
    );

    try {
      await assert.rejects(transaction.replace(restoredData()), /failed/);
      assert.deepEqual(localFingerprint(database), before);
    } finally {
      database.close();
    }
  });
}

test('rolls back when transaction finalization fails', async () => {
  const database = openMigratedDatabase();
  seedLocalData(database);
  const before = localFingerprint(database);
  const transaction = createBackupRestoreTransaction(
    createRunner(database, true),
  );

  try {
    await assert.rejects(transaction.replace(restoredData()), /finalization/);
    assert.deepEqual(localFingerprint(database), before);
  } finally {
    database.close();
  }
});

test('restoring the same backup twice is deterministic and creates no duplicates', async () => {
  const database = openMigratedDatabase();
  seedLocalData(database);
  const transaction = createBackupRestoreTransaction(createRunner(database));

  try {
    await transaction.replace(restoredData());
    const first = await readSnapshot(database, 'restored-inventory');
    await transaction.replace(restoredData());
    const second = await readSnapshot(database, 'restored-inventory');

    assert.deepEqual(second, first);
    assert.deepEqual(second, restoredData());
  } finally {
    database.close();
  }
});

test('Backup data survives a Backup to Restore to Backup round trip exactly', async () => {
  const source = openMigratedDatabase();
  const destination = openMigratedDatabase();
  const sourceTransaction = createBackupRestoreTransaction(
    createRunner(source),
  );
  const destinationTransaction = createBackupRestoreTransaction(
    createRunner(destination),
  );
  seedLocalData(destination);

  try {
    await sourceTransaction.replace(restoredData());
    const backupA = await readSnapshot(source, 'restored-inventory');
    await destinationTransaction.replace(backupA);
    const backupAfterRestore = await readSnapshot(
      destination,
      'restored-inventory',
    );

    assert.deepEqual(backupAfterRestore, backupA);
    assert.equal(backupAfterRestore.inventories[0]?.id, 'restored-inventory');
    assert.equal(backupAfterRestore.products[1]?.isArchived, true);
    assert.equal(backupAfterRestore.inventoryStates[1]?.unitCostUnits, null);
    assert.equal(backupAfterRestore.products[1]?.regularSalePriceUnits, 0);
    assert.equal(backupAfterRestore.sales[0]?.status, 'VOIDED');
    assert.equal(backupAfterRestore.inventoryMovements[4]?.type, 'REVERSAL');
  } finally {
    source.close();
    destination.close();
  }
});

test('the existing runtime reads the restored Inventory instead of the previous identity', async () => {
  const database = openMigratedDatabase();
  seedLocalData(database);
  const transaction = createBackupRestoreTransaction(createRunner(database));

  try {
    await transaction.replace(restoredData());
    const executor = createNodeSqliteDrizzle(database);
    const inventoryRepository = createInventoryRepository(
      executor as unknown as Parameters<typeof createInventoryRepository>[0],
    );
    const productRepository = createSqliteProductRepository(
      executor as unknown as Parameters<
        typeof createSqliteProductRepository
      >[0],
    );
    const inventoryStateRepository = createSqliteInventoryStateRepository(
      executor as unknown as Parameters<
        typeof createSqliteInventoryStateRepository
      >[0],
    );
    const inventory = await new GetCurrentInventoryUseCase(
      inventoryRepository,
    ).execute();

    assert.equal(inventory?.id, 'restored-inventory');
    const products = await new ListProductsUseCase({
      productRepository,
      inventoryStateRepository,
    }).execute({ inventoryId: inventory!.id });
    assert.deepEqual(
      products.map(({ product }) => product.id),
      ['product-active'],
    );
    assert.equal(products[0]?.state.stock, 12);

    const productDetails = await new GetProductDetailsUseCase({
      productRepository,
      inventoryStateRepository,
    }).execute({
      inventoryId: inventory!.id,
      productId: 'product-active',
    });
    assert.equal(productDetails?.stock, 12);

    const history = await new ListHistoryUseCase(
      createSqliteHistoryReader(
        executor as unknown as Parameters<typeof createSqliteHistoryReader>[0],
      ),
    ).execute({ inventoryId: inventory!.id });
    assert.deepEqual(history.map(({ type }) => type).sort(), [
      'ADJUSTMENT',
      'PURCHASE',
      'SALE',
    ]);

    const saleDetails = await new GetSaleDetailsUseCase(
      createSqliteSaleDetailsReader(
        executor as unknown as Parameters<
          typeof createSqliteSaleDetailsReader
        >[0],
      ),
    ).execute({ inventoryId: inventory!.id, saleId: 'sale-1' });
    const purchaseDetails = await new GetPurchaseDetailsUseCase(
      createSqlitePurchaseDetailsReader(
        executor as unknown as Parameters<
          typeof createSqlitePurchaseDetailsReader
        >[0],
      ),
    ).execute({ inventoryId: inventory!.id, purchaseId: 'purchase-1' });
    assert.equal(saleDetails?.status, 'VOIDED');
    assert.equal(purchaseDetails?.status, 'CONFIRMED');

    const summary = await new GetSalesSummaryUseCase(
      createSqliteSalesSummaryReader(
        executor as unknown as Parameters<
          typeof createSqliteSalesSummaryReader
        >[0],
      ),
    ).execute({
      inventoryId: inventory!.id,
      fromInclusive: 0,
      toExclusive: 100,
    });
    const topSeller = await new GetTopSellingProductUseCase(
      createSqliteTopSellingProductReader(
        executor as unknown as Parameters<
          typeof createSqliteTopSellingProductReader
        >[0],
      ),
    ).execute({
      inventoryId: inventory!.id,
      fromInclusive: 0,
      toExclusive: 100,
    });
    assert.equal(summary.totalAmount.scaledUnits, 0);
    assert.equal(topSeller, null);
  } finally {
    database.close();
  }
});
