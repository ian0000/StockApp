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

interface SalesMigrationSmokeResult {
  readonly existingDataPreserved: true;
  readonly salesTablesAvailable: true;
  readonly foreignKeysClean: true;
}

/**
 * Manual native-runtime verification for upgrading a populated 0000 database.
 * Import and invoke it from a temporary native-only development entry.
 * It uses and removes a dedicated disposable database without touching app data.
 */
export async function runSalesMigrationSmokeTest(): Promise<SalesMigrationSmokeResult> {
  const databaseName = `stockapp-sale-002-${Date.now()}.db`;
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
    const initialJournalEntry = migrations.journal.entries[0];
    const initialSql = migrations.migrations.m0000;

    if (initialJournalEntry === undefined || initialSql === undefined) {
      throw new Error('Migration bundle does not contain migration 0000.');
    }

    await migrate(db, {
      journal: { entries: [initialJournalEntry] },
      migrations: { m0000: initialSql },
    });

    db.insert(inventories)
      .values({
        id: 'sale-002-existing-inventory',
        name: 'Existing inventory',
        currency: 'USD',
        createdAt: 1_776_444_000_000,
        updatedAt: 1_776_444_000_000,
      })
      .run();
    db.insert(products)
      .values({
        id: 'sale-002-existing-product',
        inventoryId: 'sale-002-existing-inventory',
        name: 'Existing product',
        variant: null,
        barcode: '00123',
        regularSalePriceUnits: 1_750_000,
        minimumStock: 1,
        isArchived: false,
        createdAt: 1_776_444_000_000,
        updatedAt: 1_776_444_000_000,
      })
      .run();
    db.insert(inventoryStates)
      .values({
        inventoryId: 'sale-002-existing-inventory',
        productId: 'sale-002-existing-product',
        stock: 2,
        unitCostUnits: 500_000,
      })
      .run();
    db.insert(inventoryMovements)
      .values({
        id: 'sale-002-existing-movement',
        inventoryId: 'sale-002-existing-inventory',
        productId: 'sale-002-existing-product',
        type: 'INITIAL_STOCK',
        quantityDelta: 2,
        unitCostSnapshotUnits: 500_000,
        stockBefore: 0,
        stockAfter: 2,
        sourceType: null,
        sourceId: null,
        metadata: null,
        effectiveAt: 1_776_444_000_000,
        createdAt: 1_776_444_000_000,
        updatedAt: 1_776_444_000_000,
      })
      .run();

    await initializeAppDatabase({ sqlite, db });

    const existingDataPreserved =
      db.select().from(inventories).all().length === 1 &&
      db.select().from(products).all().length === 1 &&
      db.select().from(inventoryStates).all().length === 1 &&
      db.select().from(inventoryMovements).all().length === 1;
    const salesTablesAvailable =
      db.select().from(sales).all().length === 0 &&
      db.select().from(saleItems).all().length === 0;
    const foreignKeysClean =
      (await sqlite.getAllAsync('PRAGMA foreign_key_check')).length === 0;

    if (!existingDataPreserved || !salesTablesAvailable || !foreignKeysClean) {
      throw new Error('SALE-002 native migration smoke verification failed.');
    }

    return Object.freeze({
      existingDataPreserved: true,
      salesTablesAvailable: true,
      foreignKeysClean: true,
    });
  } finally {
    await sqlite.closeAsync();
    await deleteDatabaseAsync(databaseName);
  }
}
