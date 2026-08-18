import { Money } from '@stock-app/domain';
import { and, eq } from 'drizzle-orm';
import { deleteDatabaseAsync } from 'expo-sqlite';
import { validate, version } from 'uuid';

import { createAppRuntime } from '../../src/composition/create-app-services';
import {
  inventories,
  inventoryMovements,
  inventoryStates,
  products,
} from '../../src/infrastructure/sqlite/schema';

interface SmokeResult {
  readonly positiveInitialStock: 'passed';
  readonly zeroInitialStock: 'passed';
}

function requireUuidV7(value: string, label: string): void {
  if (!validate(value) || version(value) !== 7) {
    throw new Error(`${label} must be a valid UUIDv7.`);
  }
}

function requireRowCount(
  rows: readonly unknown[],
  expected: number,
  label: string,
): void {
  if (rows.length !== expected) {
    throw new Error(
      `${label}: expected ${expected} row(s), received ${rows.length}.`,
    );
  }
}

/**
 * Manual native-runtime verification for Expo Go or a development build.
 * Import and invoke it from a temporary native-only development entry.
 * It uses and removes a dedicated disposable database without touching app data.
 */
export async function runAppCompositionSmokeTest(): Promise<SmokeResult> {
  const databaseName = `stockapp-composition-${Date.now()}.db`;
  let runtime: Awaited<ReturnType<typeof createAppRuntime>> | undefined;

  try {
    runtime = await createAppRuntime({ databaseName });
    const { database, services } = runtime;

    requireRowCount(
      database.db.select().from(inventories).all(),
      0,
      'Inventory',
    );
    requireRowCount(database.db.select().from(products).all(), 0, 'Product');
    requireRowCount(
      database.db.select().from(inventoryStates).all(),
      0,
      'InventoryState',
    );
    requireRowCount(
      database.db.select().from(inventoryMovements).all(),
      0,
      'InventoryMovement',
    );

    const inventory = await services.createInventory.execute({
      name: 'Composition smoke inventory',
      currency: 'USD',
    });
    const positiveStockResult = await services.createProduct.execute({
      inventoryId: inventory.id,
      name: 'Positive stock product',
      barcode: 'COMPOSITION-POSITIVE',
      regularSalePrice: Money.fromDecimal('2.50'),
      minimumStock: 2,
      initialStock: 7,
      initialUnitCost: Money.fromDecimal('1.25'),
    });

    requireUuidV7(inventory.id, 'Inventory ID');
    requireUuidV7(positiveStockResult.product.id, 'Product ID');

    if (positiveStockResult.initialMovement === null) {
      throw new Error('Positive initial stock did not create a movement.');
    }

    requireUuidV7(positiveStockResult.initialMovement.id, 'Movement ID');

    const inventoryRows = database.db
      .select()
      .from(inventories)
      .where(eq(inventories.id, inventory.id))
      .all();
    const productRows = database.db
      .select()
      .from(products)
      .where(eq(products.id, positiveStockResult.product.id))
      .all();
    const stateRows = database.db
      .select()
      .from(inventoryStates)
      .where(
        and(
          eq(inventoryStates.inventoryId, inventory.id),
          eq(inventoryStates.productId, positiveStockResult.product.id),
        ),
      )
      .all();
    const movementRows = database.db
      .select()
      .from(inventoryMovements)
      .where(eq(inventoryMovements.id, positiveStockResult.initialMovement.id))
      .all();

    requireRowCount(inventoryRows, 1, 'Inventory');
    requireRowCount(productRows, 1, 'Product');
    requireRowCount(stateRows, 1, 'InventoryState');
    requireRowCount(movementRows, 1, 'InventoryMovement');

    const inventoryRow = inventoryRows[0];
    const productRow = productRows[0];
    const stateRow = stateRows[0];
    const movementRow = movementRows[0];

    if (
      inventoryRow.name !== inventory.name ||
      inventoryRow.currency !== 'USD' ||
      productRow.inventoryId !== inventory.id ||
      productRow.regularSalePriceUnits !== 2_500_000 ||
      productRow.minimumStock !== 2 ||
      stateRow.inventoryId !== inventory.id ||
      stateRow.productId !== positiveStockResult.product.id ||
      stateRow.stock !== 7 ||
      stateRow.unitCostUnits !== 1_250_000 ||
      movementRow.inventoryId !== inventory.id ||
      movementRow.productId !== positiveStockResult.product.id ||
      movementRow.type !== 'INITIAL_STOCK' ||
      movementRow.quantityDelta !== 7 ||
      movementRow.unitCostSnapshotUnits !== 1_250_000 ||
      movementRow.stockBefore !== 0 ||
      movementRow.stockAfter !== 7
    ) {
      throw new Error('Positive-stock rows do not match the use-case result.');
    }

    const zeroStockResult = await services.createProduct.execute({
      inventoryId: inventory.id,
      name: 'Zero stock product',
      regularSalePrice: Money.zero(),
      initialStock: 0,
      initialUnitCost: null,
    });

    if (zeroStockResult.initialMovement !== null) {
      throw new Error('Zero initial stock unexpectedly created a movement.');
    }

    const zeroStateRows = database.db
      .select()
      .from(inventoryStates)
      .where(eq(inventoryStates.productId, zeroStockResult.product.id))
      .all();
    requireRowCount(zeroStateRows, 1, 'Zero-stock InventoryState');

    if (
      zeroStateRows[0].stock !== 0 ||
      zeroStateRows[0].unitCostUnits !== null
    ) {
      throw new Error('Zero-stock InventoryState has unexpected values.');
    }

    requireRowCount(
      database.db.select().from(inventories).all(),
      1,
      'Inventory',
    );
    requireRowCount(database.db.select().from(products).all(), 2, 'Product');
    requireRowCount(
      database.db.select().from(inventoryStates).all(),
      2,
      'InventoryState',
    );
    requireRowCount(
      database.db.select().from(inventoryMovements).all(),
      1,
      'InventoryMovement',
    );

    return Object.freeze({
      positiveInitialStock: 'passed',
      zeroInitialStock: 'passed',
    });
  } finally {
    if (runtime !== undefined) {
      await runtime.database.sqlite.closeAsync();
    }

    await deleteDatabaseAsync(databaseName);
  }
}
