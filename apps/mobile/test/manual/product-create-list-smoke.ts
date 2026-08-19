import { and, eq } from 'drizzle-orm';
import { deleteDatabaseAsync } from 'expo-sqlite';

import { Money } from '@stock-app/domain';

import { createAppRuntime } from '../../src/composition/create-app-services';
import {
  inventoryMovements,
  inventoryStates,
  products,
} from '../../src/infrastructure/sqlite/schema';

interface ProductCreateListSmokeResult {
  readonly productWithStock: 'passed';
  readonly productWithoutStock: 'passed';
  readonly restartPersistence: 'passed';
}

/**
 * Manual native-only smoke for Expo Go or a development build.
 * Invoke temporarily from a native entry. It uses and removes a dedicated DB.
 */
export async function runProductCreateListSmokeTest(): Promise<ProductCreateListSmokeResult> {
  const databaseName = `stockapp-products-${Date.now()}.db`;
  let runtime: Awaited<ReturnType<typeof createAppRuntime>> | undefined;

  try {
    runtime = await createAppRuntime({ databaseName });
    const inventory = await runtime.services.createInventory.execute({
      name: 'Smoke Shop',
      currency: 'USD',
    });
    const cocaCola = await runtime.services.createProduct.execute({
      inventoryId: inventory.id,
      name: 'Coca-Cola',
      variant: '500 ml',
      barcode: null,
      regularSalePrice: Money.fromDecimal('1.00'),
      minimumStock: 2,
      initialStock: 10,
      initialUnitCost: Money.fromDecimal('0.70'),
    });

    await assertCocaColaPersistence(runtime, inventory.id, cocaCola.product.id);

    await runtime.database.sqlite.closeAsync();
    runtime = undefined;

    runtime = await createAppRuntime({ databaseName });
    const afterRestart = await runtime.services.listProducts.execute({
      inventoryId: inventory.id,
    });
    const restartedCocaCola = afterRestart.find(
      ({ product }) => product.id === cocaCola.product.id,
    );

    if (restartedCocaCola?.state.stock !== 10) {
      throw new Error('Coca-Cola did not survive a native runtime restart.');
    }

    const water = await runtime.services.createProduct.execute({
      inventoryId: inventory.id,
      name: 'Agua',
      regularSalePrice: Money.fromDecimal('0.75'),
      minimumStock: null,
      initialStock: 0,
      initialUnitCost: null,
    });

    await assertWaterPersistence(runtime, inventory.id, water.product.id);

    return Object.freeze({
      productWithStock: 'passed',
      productWithoutStock: 'passed',
      restartPersistence: 'passed',
    });
  } finally {
    if (runtime !== undefined) {
      await runtime.database.sqlite.closeAsync();
    }

    await deleteDatabaseAsync(databaseName);
  }
}

async function assertCocaColaPersistence(
  runtime: Awaited<ReturnType<typeof createAppRuntime>>,
  inventoryId: string,
  productId: string,
): Promise<void> {
  const [productRows, stateRows, movementRows] = await Promise.all([
    runtime.database.db
      .select()
      .from(products)
      .where(
        and(eq(products.inventoryId, inventoryId), eq(products.id, productId)),
      ),
    runtime.database.db
      .select()
      .from(inventoryStates)
      .where(
        and(
          eq(inventoryStates.inventoryId, inventoryId),
          eq(inventoryStates.productId, productId),
        ),
      ),
    runtime.database.db
      .select()
      .from(inventoryMovements)
      .where(
        and(
          eq(inventoryMovements.inventoryId, inventoryId),
          eq(inventoryMovements.productId, productId),
        ),
      ),
  ]);

  const state = stateRows[0];
  const movement = movementRows[0];

  if (productRows.length !== 1) {
    throw new Error('Coca-Cola Product row is missing.');
  }

  if (state?.stock !== 10 || state.unitCostUnits !== 700_000) {
    throw new Error('Coca-Cola InventoryState is incorrect.');
  }

  if (
    movementRows.length !== 1 ||
    movement?.type !== 'INITIAL_STOCK' ||
    movement.quantityDelta !== 10 ||
    movement.stockBefore !== 0 ||
    movement.stockAfter !== 10 ||
    movement.unitCostSnapshotUnits !== 700_000
  ) {
    throw new Error('Coca-Cola INITIAL_STOCK movement is incorrect.');
  }
}

async function assertWaterPersistence(
  runtime: Awaited<ReturnType<typeof createAppRuntime>>,
  inventoryId: string,
  productId: string,
): Promise<void> {
  const [productRows, stateRows, movementRows] = await Promise.all([
    runtime.database.db
      .select()
      .from(products)
      .where(
        and(eq(products.inventoryId, inventoryId), eq(products.id, productId)),
      ),
    runtime.database.db
      .select()
      .from(inventoryStates)
      .where(
        and(
          eq(inventoryStates.inventoryId, inventoryId),
          eq(inventoryStates.productId, productId),
        ),
      ),
    runtime.database.db
      .select()
      .from(inventoryMovements)
      .where(
        and(
          eq(inventoryMovements.inventoryId, inventoryId),
          eq(inventoryMovements.productId, productId),
        ),
      ),
  ]);

  if (productRows.length !== 1) {
    throw new Error('Agua Product row is missing.');
  }

  if (stateRows[0]?.stock !== 0 || stateRows[0].unitCostUnits !== null) {
    throw new Error('Agua InventoryState must preserve an unknown cost.');
  }

  if (movementRows.length !== 0) {
    throw new Error('Agua must not create an INITIAL_STOCK movement.');
  }
}
