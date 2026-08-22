import { and, eq } from 'drizzle-orm';
import { deleteDatabaseAsync } from 'expo-sqlite';

import { Money } from '@stock-app/domain';

import { createAppRuntime } from '../../src/composition/create-app-services';
import {
  inventoryMovements,
  inventoryStates,
  purchases,
} from '../../src/infrastructure/sqlite/schema';

interface RegisterPurchaseSmokeResult {
  readonly positiveStock: 'passed';
  readonly remainsNegative: 'passed';
  readonly crossesToPositive: 'passed';
  readonly rollback: 'passed';
}

/**
 * Manual native-only smoke for Expo Go or a development build.
 * Invoke temporarily from a native entry. It uses and removes a dedicated DB.
 */
export async function runRegisterPurchaseSmokeTest(): Promise<RegisterPurchaseSmokeResult> {
  const databaseName = `stockapp-register-purchase-${Date.now()}.db`;
  let runtime: Awaited<ReturnType<typeof createAppRuntime>> | undefined;

  try {
    runtime = await createAppRuntime({ databaseName });
    const { database, services } = runtime;
    const inventory = await services.createInventory.execute({
      name: 'Register purchase smoke',
      currency: 'USD',
    });
    const positiveProduct = await services.createProduct.execute({
      inventoryId: inventory.id,
      name: 'Positive stock',
      regularSalePrice: Money.fromDecimal('15'),
      initialStock: 20,
      initialUnitCost: Money.fromDecimal('10'),
    });
    const remainsNegativeProduct = await createNegativeProduct(
      runtime,
      inventory.id,
      'Remains negative',
    );
    const crossesPositiveProduct = await createNegativeProduct(
      runtime,
      inventory.id,
      'Crosses positive',
    );
    const rollbackProduct = await services.createProduct.execute({
      inventoryId: inventory.id,
      name: 'Rollback target',
      regularSalePrice: Money.fromDecimal('1'),
      initialStock: 0,
      initialUnitCost: null,
    });

    const positivePurchase = await services.registerPurchase.execute({
      inventoryId: inventory.id,
      productId: positiveProduct.product.id,
      quantity: 10,
      unitCost: Money.fromDecimal('12'),
      notes: 'Scenario A',
    });
    await assertPersistedPurchase(runtime, positivePurchase.id, {
      productId: positiveProduct.product.id,
      quantity: 10,
      unitCostUnits: 12_000_000,
      totalAmountUnits: 120_000_000,
      averageCostBeforeUnits: 10_000_000,
      averageCostAfterUnits: 10_666_667,
      stockBefore: 20,
      stockAfter: 30,
    });

    const remainsNegativePurchase = await services.registerPurchase.execute({
      inventoryId: inventory.id,
      productId: remainsNegativeProduct,
      quantity: 4,
      unitCost: Money.fromDecimal('2'),
    });
    await assertPersistedPurchase(runtime, remainsNegativePurchase.id, {
      productId: remainsNegativeProduct,
      quantity: 4,
      unitCostUnits: 2_000_000,
      totalAmountUnits: 8_000_000,
      averageCostBeforeUnits: null,
      averageCostAfterUnits: 2_000_000,
      stockBefore: -10,
      stockAfter: -6,
    });

    const crossesPositivePurchase = await services.registerPurchase.execute({
      inventoryId: inventory.id,
      productId: crossesPositiveProduct,
      quantity: 15,
      unitCost: Money.fromDecimal('3'),
    });
    await assertPersistedPurchase(runtime, crossesPositivePurchase.id, {
      productId: crossesPositiveProduct,
      quantity: 15,
      unitCostUnits: 3_000_000,
      totalAmountUnits: 45_000_000,
      averageCostBeforeUnits: null,
      averageCostAfterUnits: 3_000_000,
      stockBefore: -10,
      stockAfter: 5,
    });

    await database.sqlite.execAsync(`
      CREATE TRIGGER purchase_003_fail_late
      BEFORE UPDATE ON inventory_states
      WHEN OLD.product_id = '${rollbackProduct.product.id}'
      BEGIN
        SELECT RAISE(ABORT, 'PURCHASE-003 controlled late failure');
      END;
    `);
    await assertRejects(() =>
      services.registerPurchase.execute({
        inventoryId: inventory.id,
        productId: rollbackProduct.product.id,
        quantity: 2,
        unitCost: Money.fromDecimal('4'),
      }),
    );
    const rollbackPurchases = database.db
      .select()
      .from(purchases)
      .where(eq(purchases.productId, rollbackProduct.product.id))
      .all();
    const rollbackMovements = database.db
      .select()
      .from(inventoryMovements)
      .where(
        and(
          eq(inventoryMovements.productId, rollbackProduct.product.id),
          eq(inventoryMovements.type, 'PURCHASE'),
        ),
      )
      .all();
    const rollbackState = database.db
      .select()
      .from(inventoryStates)
      .where(eq(inventoryStates.productId, rollbackProduct.product.id))
      .get();

    if (
      rollbackPurchases.length !== 0 ||
      rollbackMovements.length !== 0 ||
      rollbackState?.stock !== 0 ||
      rollbackState.unitCostUnits !== null
    ) {
      throw new Error('RegisterPurchase did not roll back every late write.');
    }

    return Object.freeze({
      positiveStock: 'passed',
      remainsNegative: 'passed',
      crossesToPositive: 'passed',
      rollback: 'passed',
    });
  } finally {
    if (runtime !== undefined) await runtime.database.sqlite.closeAsync();
    await deleteDatabaseAsync(databaseName);
  }
}

async function createNegativeProduct(
  runtime: Awaited<ReturnType<typeof createAppRuntime>>,
  inventoryId: string,
  name: string,
): Promise<string> {
  const created = await runtime.services.createProduct.execute({
    inventoryId,
    name,
    regularSalePrice: Money.fromDecimal('1'),
    initialStock: 0,
    initialUnitCost: null,
  });

  await runtime.services.registerSale.execute({
    inventoryId,
    items: [
      {
        productId: created.product.id,
        quantity: 10,
        unitSalePrice: Money.fromDecimal('1'),
      },
    ],
  });

  return created.product.id;
}

interface ExpectedPurchase {
  readonly productId: string;
  readonly quantity: number;
  readonly unitCostUnits: number;
  readonly totalAmountUnits: number;
  readonly averageCostBeforeUnits: number | null;
  readonly averageCostAfterUnits: number;
  readonly stockBefore: number;
  readonly stockAfter: number;
}

async function assertPersistedPurchase(
  runtime: Awaited<ReturnType<typeof createAppRuntime>>,
  purchaseId: string,
  expected: ExpectedPurchase,
): Promise<void> {
  const purchase = runtime.database.db
    .select()
    .from(purchases)
    .where(eq(purchases.id, purchaseId))
    .get();
  const movements = runtime.database.db
    .select()
    .from(inventoryMovements)
    .where(
      and(
        eq(inventoryMovements.sourceType, 'PURCHASE'),
        eq(inventoryMovements.sourceId, purchaseId),
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
    purchase === undefined ||
    purchase.quantity !== expected.quantity ||
    purchase.unitCostUnits !== expected.unitCostUnits ||
    purchase.totalAmountUnits !== expected.totalAmountUnits ||
    purchase.averageCostBeforeUnits !== expected.averageCostBeforeUnits ||
    purchase.averageCostAfterUnits !== expected.averageCostAfterUnits ||
    purchase.stockBefore !== expected.stockBefore ||
    purchase.stockAfter !== expected.stockAfter ||
    purchase.status !== 'CONFIRMED' ||
    movements.length !== 1 ||
    movement?.type !== 'PURCHASE' ||
    movement.quantityDelta !== expected.quantity ||
    movement.unitCostSnapshotUnits !== expected.unitCostUnits ||
    movement.stockBefore !== expected.stockBefore ||
    movement.stockAfter !== expected.stockAfter ||
    state?.stock !== expected.stockAfter ||
    state.unitCostUnits !== expected.averageCostAfterUnits
  ) {
    throw new Error('RegisterPurchase native persisted rows are incorrect.');
  }
}

async function assertRejects(operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
  } catch {
    return;
  }

  throw new Error('RegisterPurchase rollback smoke expected a failure.');
}
