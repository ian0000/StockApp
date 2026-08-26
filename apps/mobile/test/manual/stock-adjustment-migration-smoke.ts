import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { deleteDatabaseAsync, openDatabaseAsync } from 'expo-sqlite';

import migrations from '../../drizzle/migrations';
import { initializeAppDatabase } from '../../src/infrastructure/sqlite/migrations';
import {
  inventories,
  inventoryMovements,
  inventoryStates,
  products,
  purchases,
  saleItems,
  sales,
  stockAdjustments,
} from '../../src/infrastructure/sqlite/schema';

interface StockAdjustmentMigrationSmokeResult {
  readonly existingDataPreserved: true;
  readonly stockAdjustmentsTableAvailable: true;
  readonly foreignKeysClean: true;
}

/**
 * Manual native-runtime verification for upgrading a populated 0000-0002 database.
 * Import and invoke it from a temporary native-only development entry.
 * It uses and removes a dedicated disposable database without touching app data.
 */
export async function runStockAdjustmentMigrationSmokeTest(): Promise<StockAdjustmentMigrationSmokeResult> {
  const databaseName = `stockapp-adjustment-002-${Date.now()}.db`;
  const sqlite = await openDatabaseAsync(databaseName);

  try {
    await sqlite.execAsync(
      'PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;',
    );

    const db = drizzle(sqlite, {
      schema: {
        inventories,
        inventoryMovements,
        inventoryStates,
        products,
        purchases,
        saleItems,
        sales,
        stockAdjustments,
      },
    });
    const previousJournalEntries = migrations.journal.entries.slice(0, 3);
    const initialSql = migrations.migrations.m0000;
    const salesSql = migrations.migrations.m0001;
    const purchasesSql = migrations.migrations.m0002;

    if (
      previousJournalEntries.length !== 3 ||
      initialSql === undefined ||
      salesSql === undefined ||
      purchasesSql === undefined
    ) {
      throw new Error(
        'Migration bundle does not contain migrations 0000-0002.',
      );
    }

    await migrate(db, {
      journal: { entries: previousJournalEntries },
      migrations: {
        m0000: initialSql,
        m0001: salesSql,
        m0002: purchasesSql,
      },
    });

    const timestamp = 1_776_444_000_000;
    const inventoryId = 'adjustment-002-existing-inventory';
    const productId = 'adjustment-002-existing-product';

    db.insert(inventories)
      .values({
        id: inventoryId,
        name: 'Existing inventory',
        currency: 'USD',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    db.insert(products)
      .values({
        id: productId,
        inventoryId,
        name: 'Existing product',
        variant: null,
        barcode: '00123',
        regularSalePriceUnits: 1_750_000,
        minimumStock: 1,
        isArchived: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    db.insert(inventoryStates)
      .values({
        inventoryId,
        productId,
        stock: 13,
        unitCostUnits: 815_385,
      })
      .run();
    db.insert(inventoryMovements)
      .values({
        id: 'adjustment-002-initial-movement',
        inventoryId,
        productId,
        type: 'INITIAL_STOCK',
        quantityDelta: 10,
        unitCostSnapshotUnits: 700_000,
        stockBefore: 0,
        stockAfter: 10,
        sourceType: null,
        sourceId: null,
        metadata: null,
        effectiveAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    db.insert(sales)
      .values({
        id: 'adjustment-002-existing-sale',
        inventoryId,
        effectiveAt: timestamp + 1,
        createdAt: timestamp + 1,
        updatedAt: timestamp + 1,
        status: 'CONFIRMED',
        totalAmountUnits: 2_000_000,
        estimatedCostUnits: 1_400_000,
        estimatedProfitUnits: 600_000,
        notes: null,
      })
      .run();
    db.insert(saleItems)
      .values({
        id: 'adjustment-002-existing-sale-item',
        saleId: 'adjustment-002-existing-sale',
        productId,
        quantity: 2,
        unitSalePriceUnits: 1_000_000,
        subtotalUnits: 2_000_000,
        unitCostSnapshotUnits: 700_000,
        estimatedCostUnits: 1_400_000,
        estimatedProfitUnits: 600_000,
        costStatus: 'KNOWN',
        createdAt: timestamp + 1,
        updatedAt: timestamp + 1,
      })
      .run();
    db.insert(inventoryMovements)
      .values({
        id: 'adjustment-002-sale-movement',
        inventoryId,
        productId,
        type: 'SALE',
        quantityDelta: -2,
        unitCostSnapshotUnits: 700_000,
        stockBefore: 10,
        stockAfter: 8,
        sourceType: 'SALE',
        sourceId: 'adjustment-002-existing-sale',
        metadata: null,
        effectiveAt: timestamp + 1,
        createdAt: timestamp + 1,
        updatedAt: timestamp + 1,
      })
      .run();
    db.insert(purchases)
      .values({
        id: 'adjustment-002-existing-purchase',
        inventoryId,
        productId,
        quantity: 5,
        unitCostUnits: 1_000_000,
        totalAmountUnits: 5_000_000,
        effectiveAt: timestamp + 2,
        createdAt: timestamp + 2,
        updatedAt: timestamp + 2,
        status: 'CONFIRMED',
        notes: null,
        averageCostBeforeUnits: 700_000,
        averageCostAfterUnits: 815_385,
        stockBefore: 8,
        stockAfter: 13,
      })
      .run();
    db.insert(inventoryMovements)
      .values({
        id: 'adjustment-002-purchase-movement',
        inventoryId,
        productId,
        type: 'PURCHASE',
        quantityDelta: 5,
        unitCostSnapshotUnits: 1_000_000,
        stockBefore: 8,
        stockAfter: 13,
        sourceType: 'PURCHASE',
        sourceId: 'adjustment-002-existing-purchase',
        metadata: null,
        effectiveAt: timestamp + 2,
        createdAt: timestamp + 2,
        updatedAt: timestamp + 2,
      })
      .run();
    db.update(inventoryStates)
      .set({ stock: 13, unitCostUnits: 815_385 })
      .where(eq(inventoryStates.productId, productId))
      .run();

    await initializeAppDatabase({ sqlite, db });

    const existingDataPreserved =
      db.select().from(inventories).all().length === 1 &&
      db.select().from(products).all().length === 1 &&
      db.select().from(inventoryStates).all()[0]?.stock === 13 &&
      db.select().from(inventoryMovements).all().length === 3 &&
      db.select().from(sales).all().length === 1 &&
      db.select().from(saleItems).all().length === 1 &&
      db.select().from(purchases).all().length === 1;
    const stockAdjustmentsTableAvailable =
      db.select().from(stockAdjustments).all().length === 0;
    const foreignKeysClean =
      (await sqlite.getAllAsync('PRAGMA foreign_key_check')).length === 0;

    if (
      !existingDataPreserved ||
      !stockAdjustmentsTableAvailable ||
      !foreignKeysClean
    ) {
      throw new Error(
        'ADJUSTMENT-002 native migration smoke verification failed.',
      );
    }

    return Object.freeze({
      existingDataPreserved: true,
      stockAdjustmentsTableAvailable: true,
      foreignKeysClean: true,
    });
  } finally {
    await sqlite.closeAsync();
    await deleteDatabaseAsync(databaseName);
  }
}
