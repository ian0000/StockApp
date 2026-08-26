import { and, eq } from 'drizzle-orm';
import { deleteDatabaseAsync } from 'expo-sqlite';

import { Money } from '@stock-app/domain';

import { createAppRuntime } from '../../src/composition/create-app-services';
import {
  inventoryMovements,
  inventoryStates,
  stockAdjustments,
} from '../../src/infrastructure/sqlite/schema';

interface RegisterAdjustmentSmokeResult {
  readonly positive: 'passed';
  readonly negative: 'passed';
  readonly negativeStock: 'passed';
  readonly rollback: 'passed';
}

/**
 * Manual native-only smoke for Expo Go or a development build.
 * Invoke temporarily from a native entry. It uses and removes a dedicated DB.
 */
export async function runRegisterStockAdjustmentSmokeTest(): Promise<RegisterAdjustmentSmokeResult> {
  const databaseName = `stockapp-register-adjustment-${Date.now()}.db`;
  let runtime: Awaited<ReturnType<typeof createAppRuntime>> | undefined;

  try {
    runtime = await createAppRuntime({ databaseName });
    const { database, services } = runtime;
    const inventory = await services.createInventory.execute({
      name: 'Register adjustment smoke',
      currency: 'USD',
    });
    const positive = await services.createProduct.execute({
      inventoryId: inventory.id,
      name: 'Positive adjustment',
      regularSalePrice: Money.fromDecimal('5'),
      initialStock: 10,
      initialUnitCost: Money.fromDecimal('2'),
    });
    const negative = await services.createProduct.execute({
      inventoryId: inventory.id,
      name: 'Negative adjustment',
      regularSalePrice: Money.fromDecimal('5'),
      initialStock: 10,
      initialUnitCost: Money.fromDecimal('2'),
    });
    const negativeStock = await createNegativeStockProduct(
      runtime,
      inventory.id,
    );
    const rollback = await services.createProduct.execute({
      inventoryId: inventory.id,
      name: 'Rollback adjustment',
      regularSalePrice: Money.fromDecimal('5'),
      initialStock: 10,
      initialUnitCost: Money.fromDecimal('2'),
    });

    const positiveResult = await services.adjustStock.execute({
      inventoryId: inventory.id,
      productId: positive.product.id,
      actualStock: 15,
      reason: 'COUNT_CORRECTION',
      costMode: 'CUSTOM_COST',
      customUnitCost: Money.fromDecimal('4'),
    });
    await assertPersisted(runtime, positiveResult.adjustment.id, {
      productId: positive.product.id,
      difference: 5,
      movementType: 'ADJUSTMENT_IN',
      unitCostUnits: 4_000_000,
      resultingCostUnits: 2_666_667,
      stockBefore: 10,
      stockAfter: 15,
    });

    const negativeResult = await services.adjustStock.execute({
      inventoryId: inventory.id,
      productId: negative.product.id,
      actualStock: 7,
      reason: 'DAMAGED',
    });
    await assertPersisted(runtime, negativeResult.adjustment.id, {
      productId: negative.product.id,
      difference: -3,
      movementType: 'ADJUSTMENT_OUT',
      unitCostUnits: 2_000_000,
      resultingCostUnits: 2_000_000,
      stockBefore: 10,
      stockAfter: 7,
    });

    const negativeStockResult = await services.adjustStock.execute({
      inventoryId: inventory.id,
      productId: negativeStock,
      actualStock: 3,
      reason: 'COUNT_CORRECTION',
      costMode: 'CUSTOM_COST',
      customUnitCost: Money.fromDecimal('3'),
    });
    await assertPersisted(runtime, negativeStockResult.adjustment.id, {
      productId: negativeStock,
      difference: 5,
      movementType: 'ADJUSTMENT_IN',
      unitCostUnits: 3_000_000,
      resultingCostUnits: 3_000_000,
      stockBefore: -2,
      stockAfter: 3,
    });

    await database.sqlite.execAsync(`
      CREATE TRIGGER adjustment_003_fail_late
      BEFORE UPDATE ON inventory_states
      WHEN OLD.product_id = '${rollback.product.id}'
      BEGIN
        SELECT RAISE(ABORT, 'ADJUSTMENT-003 controlled late failure');
      END;
    `);
    await assertRejects(() =>
      services.adjustStock.execute({
        inventoryId: inventory.id,
        productId: rollback.product.id,
        actualStock: 15,
        reason: 'COUNT_CORRECTION',
        costMode: 'USE_CURRENT_COST',
      }),
    );
    const rollbackAdjustments = database.db
      .select()
      .from(stockAdjustments)
      .where(eq(stockAdjustments.productId, rollback.product.id))
      .all();
    const rollbackMovements = database.db
      .select()
      .from(inventoryMovements)
      .where(
        and(
          eq(inventoryMovements.productId, rollback.product.id),
          eq(inventoryMovements.sourceType, 'STOCK_ADJUSTMENT'),
        ),
      )
      .all();
    const rollbackState = database.db
      .select()
      .from(inventoryStates)
      .where(eq(inventoryStates.productId, rollback.product.id))
      .get();

    if (
      rollbackAdjustments.length !== 0 ||
      rollbackMovements.length !== 0 ||
      rollbackState?.stock !== 10 ||
      rollbackState.unitCostUnits !== 2_000_000
    ) {
      throw new Error('AdjustStock did not roll back every late write.');
    }

    return Object.freeze({
      positive: 'passed',
      negative: 'passed',
      negativeStock: 'passed',
      rollback: 'passed',
    });
  } finally {
    if (runtime !== undefined) await runtime.database.sqlite.closeAsync();
    await deleteDatabaseAsync(databaseName);
  }
}

async function createNegativeStockProduct(
  runtime: Awaited<ReturnType<typeof createAppRuntime>>,
  inventoryId: string,
): Promise<string> {
  const created = await runtime.services.createProduct.execute({
    inventoryId,
    name: 'Negative registered stock',
    regularSalePrice: Money.fromDecimal('1'),
    initialStock: 0,
    initialUnitCost: null,
  });
  await runtime.services.registerSale.execute({
    inventoryId,
    items: [
      {
        productId: created.product.id,
        quantity: 2,
        unitSalePrice: Money.fromDecimal('1'),
      },
    ],
  });
  return created.product.id;
}

interface ExpectedPersistence {
  readonly productId: string;
  readonly difference: number;
  readonly movementType: 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT';
  readonly unitCostUnits: number;
  readonly resultingCostUnits: number;
  readonly stockBefore: number;
  readonly stockAfter: number;
}

async function assertPersisted(
  runtime: Awaited<ReturnType<typeof createAppRuntime>>,
  adjustmentId: string,
  expected: ExpectedPersistence,
): Promise<void> {
  const adjustment = runtime.database.db
    .select()
    .from(stockAdjustments)
    .where(eq(stockAdjustments.id, adjustmentId))
    .get();
  const movements = runtime.database.db
    .select()
    .from(inventoryMovements)
    .where(
      and(
        eq(inventoryMovements.sourceType, 'STOCK_ADJUSTMENT'),
        eq(inventoryMovements.sourceId, adjustmentId),
      ),
    )
    .all();
  const state = runtime.database.db
    .select()
    .from(inventoryStates)
    .where(eq(inventoryStates.productId, expected.productId))
    .get();
  const movement = movements[0];

  if (
    adjustment === undefined ||
    adjustment.stockBefore !== expected.stockBefore ||
    adjustment.actualStock !== expected.stockAfter ||
    adjustment.difference !== expected.difference ||
    adjustment.unitCostUnits !== expected.unitCostUnits ||
    movements.length !== 1 ||
    movement?.type !== expected.movementType ||
    movement.quantityDelta !== expected.difference ||
    movement.unitCostSnapshotUnits !== expected.unitCostUnits ||
    movement.stockBefore !== expected.stockBefore ||
    movement.stockAfter !== expected.stockAfter ||
    state?.stock !== expected.stockAfter ||
    state.unitCostUnits !== expected.resultingCostUnits
  ) {
    throw new Error('AdjustStock native persisted rows are incorrect.');
  }
}

async function assertRejects(operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
  } catch {
    return;
  }

  throw new Error('AdjustStock rollback smoke expected a failure.');
}
