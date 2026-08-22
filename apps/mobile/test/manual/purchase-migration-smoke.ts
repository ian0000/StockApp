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
} from '../../src/infrastructure/sqlite/schema';

interface PurchaseMigrationSmokeResult {
  readonly existingDataPreserved: true;
  readonly purchasesTableAvailable: true;
  readonly foreignKeysClean: true;
}

/**
 * Manual native-runtime verification for upgrading a populated 0000+0001 database.
 * Import and invoke it from a temporary native-only development entry.
 * It uses and removes a dedicated disposable database without touching app data.
 */
export async function runPurchaseMigrationSmokeTest(): Promise<PurchaseMigrationSmokeResult> {
  const databaseName = `stockapp-purchase-002-${Date.now()}.db`;
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
      },
    });
    const initialJournalEntries = migrations.journal.entries.slice(0, 2);
    const initialSql = migrations.migrations.m0000;
    const salesSql = migrations.migrations.m0001;

    if (
      initialJournalEntries.length !== 2 ||
      initialSql === undefined ||
      salesSql === undefined
    ) {
      throw new Error(
        'Migration bundle does not contain migrations 0000+0001.',
      );
    }

    await migrate(db, {
      journal: { entries: initialJournalEntries },
      migrations: { m0000: initialSql, m0001: salesSql },
    });

    const timestamp = 1_776_444_000_000;
    db.insert(inventories)
      .values({
        id: 'purchase-002-existing-inventory',
        name: 'Existing inventory',
        currency: 'USD',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    db.insert(products)
      .values({
        id: 'purchase-002-existing-product',
        inventoryId: 'purchase-002-existing-inventory',
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
        inventoryId: 'purchase-002-existing-inventory',
        productId: 'purchase-002-existing-product',
        stock: 10,
        unitCostUnits: 700_000,
      })
      .run();
    db.insert(inventoryMovements)
      .values({
        id: 'purchase-002-initial-movement',
        inventoryId: 'purchase-002-existing-inventory',
        productId: 'purchase-002-existing-product',
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
        id: 'purchase-002-existing-sale',
        inventoryId: 'purchase-002-existing-inventory',
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
        id: 'purchase-002-existing-sale-item',
        saleId: 'purchase-002-existing-sale',
        productId: 'purchase-002-existing-product',
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
        id: 'purchase-002-sale-movement',
        inventoryId: 'purchase-002-existing-inventory',
        productId: 'purchase-002-existing-product',
        type: 'SALE',
        quantityDelta: -2,
        unitCostSnapshotUnits: 700_000,
        stockBefore: 10,
        stockAfter: 8,
        sourceType: 'SALE',
        sourceId: 'purchase-002-existing-sale',
        metadata: null,
        effectiveAt: timestamp + 1,
        createdAt: timestamp + 1,
        updatedAt: timestamp + 1,
      })
      .run();
    db.update(inventoryStates)
      .set({ stock: 8 })
      .where(eq(inventoryStates.productId, 'purchase-002-existing-product'))
      .run();

    await initializeAppDatabase({ sqlite, db });

    const existingDataPreserved =
      db.select().from(inventories).all().length === 1 &&
      db.select().from(products).all().length === 1 &&
      db.select().from(inventoryStates).all()[0]?.stock === 8 &&
      db.select().from(inventoryMovements).all().length === 2 &&
      db.select().from(sales).all().length === 1 &&
      db.select().from(saleItems).all().length === 1;
    const purchasesTableAvailable =
      db.select().from(purchases).all().length === 0;
    const foreignKeysClean =
      (await sqlite.getAllAsync('PRAGMA foreign_key_check')).length === 0;

    if (
      !existingDataPreserved ||
      !purchasesTableAvailable ||
      !foreignKeysClean
    ) {
      throw new Error(
        'PURCHASE-002 native migration smoke verification failed.',
      );
    }

    return Object.freeze({
      existingDataPreserved: true,
      purchasesTableAvailable: true,
      foreignKeysClean: true,
    });
  } finally {
    await sqlite.closeAsync();
    await deleteDatabaseAsync(databaseName);
  }
}
