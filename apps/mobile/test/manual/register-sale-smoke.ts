import { and, eq } from 'drizzle-orm';
import { deleteDatabaseAsync } from 'expo-sqlite';

import { Money } from '@stock-app/domain';

import { createAppRuntime } from '../../src/composition/create-app-services';
import {
  inventoryMovements,
  inventoryStates,
  saleItems,
  sales,
} from '../../src/infrastructure/sqlite/schema';

interface RegisterSaleSmokeResult {
  readonly successCase: 'passed';
  readonly rollbackCase: 'passed';
}

/**
 * Manual native-only smoke for Expo Go or a development build.
 * Invoke temporarily from a native entry. It uses and removes a dedicated DB.
 */
export async function runRegisterSaleSmokeTest(): Promise<RegisterSaleSmokeResult> {
  const databaseName = `stockapp-register-sale-${Date.now()}.db`;
  let runtime: Awaited<ReturnType<typeof createAppRuntime>> | undefined;

  try {
    runtime = await createAppRuntime({ databaseName });
    const { database, services } = runtime;
    const inventory = await services.createInventory.execute({
      name: 'Register sale smoke',
      currency: 'USD',
    });
    const productA = await services.createProduct.execute({
      inventoryId: inventory.id,
      name: 'Product A',
      regularSalePrice: Money.fromDecimal('0.50'),
      initialStock: 10,
      initialUnitCost: Money.fromDecimal('0.30'),
    });
    const productB = await services.createProduct.execute({
      inventoryId: inventory.id,
      name: 'Product B',
      regularSalePrice: Money.fromDecimal('0.75'),
      initialStock: 0,
      initialUnitCost: null,
    });
    const input = {
      inventoryId: inventory.id,
      items: [
        {
          productId: productA.product.id,
          quantity: 2,
          unitSalePrice: Money.fromDecimal('0.50'),
        },
        {
          productId: productB.product.id,
          quantity: 1,
          unitSalePrice: Money.fromDecimal('0.75'),
        },
      ],
      notes: 'Native smoke',
    } as const;

    await database.sqlite.execAsync(`
      CREATE TRIGGER sale_003_fail_late
      BEFORE UPDATE ON inventory_states
      WHEN NEW.stock < 0
      BEGIN
        SELECT RAISE(ABORT, 'SALE-003 controlled late failure');
      END;
    `);

    await assertRollbackCase(
      runtime,
      input,
      productA.product.id,
      productB.product.id,
    );
    await database.sqlite.execAsync('DROP TRIGGER sale_003_fail_late;');

    const result = await services.registerSale.execute(input);

    await assertSuccessCase(
      runtime,
      result.sale.id,
      productA.product.id,
      productB.product.id,
    );

    return Object.freeze({ successCase: 'passed', rollbackCase: 'passed' });
  } finally {
    if (runtime !== undefined) {
      await runtime.database.sqlite.closeAsync();
    }

    await deleteDatabaseAsync(databaseName);
  }
}

async function assertRollbackCase(
  runtime: Awaited<ReturnType<typeof createAppRuntime>>,
  input: Parameters<
    Awaited<
      ReturnType<typeof createAppRuntime>
    >['services']['registerSale']['execute']
  >[0],
  productAId: string,
  productBId: string,
): Promise<void> {
  await assertRejects(() => runtime.services.registerSale.execute(input));

  const saleRows = runtime.database.db.select().from(sales).all();
  const itemRows = runtime.database.db.select().from(saleItems).all();
  const movementRows = runtime.database.db
    .select()
    .from(inventoryMovements)
    .where(eq(inventoryMovements.type, 'SALE'))
    .all();
  const stateRows = runtime.database.db
    .select()
    .from(inventoryStates)
    .where(eq(inventoryStates.inventoryId, input.inventoryId))
    .all();
  const stateA = stateRows.find(({ productId }) => productId === productAId);
  const stateB = stateRows.find(({ productId }) => productId === productBId);

  if (
    saleRows.length !== 0 ||
    itemRows.length !== 0 ||
    movementRows.length !== 0 ||
    stateA?.stock !== 10 ||
    stateB?.stock !== 0
  ) {
    throw new Error('RegisterSale did not roll back every late write.');
  }
}

async function assertSuccessCase(
  runtime: Awaited<ReturnType<typeof createAppRuntime>>,
  saleId: string,
  productAId: string,
  productBId: string,
): Promise<void> {
  const { database } = runtime;
  const saleRows = database.db
    .select()
    .from(sales)
    .where(eq(sales.id, saleId))
    .all();
  const itemRows = database.db
    .select()
    .from(saleItems)
    .where(eq(saleItems.saleId, saleId))
    .all();
  const movementRows = database.db
    .select()
    .from(inventoryMovements)
    .where(
      and(
        eq(inventoryMovements.sourceType, 'SALE'),
        eq(inventoryMovements.sourceId, saleId),
      ),
    )
    .all();
  const stateRows = database.db.select().from(inventoryStates).all();
  const itemA = itemRows.find(({ productId }) => productId === productAId);
  const itemB = itemRows.find(({ productId }) => productId === productBId);
  const movementA = movementRows.find(
    ({ productId }) => productId === productAId,
  );
  const movementB = movementRows.find(
    ({ productId }) => productId === productBId,
  );
  const stateA = stateRows.find(({ productId }) => productId === productAId);
  const stateB = stateRows.find(({ productId }) => productId === productBId);

  if (
    saleRows.length !== 1 ||
    saleRows[0]?.totalAmountUnits !== 1_750_000 ||
    saleRows[0].estimatedCostUnits !== null ||
    saleRows[0].estimatedProfitUnits !== null ||
    itemRows.length !== 2 ||
    itemA?.subtotalUnits !== 1_000_000 ||
    itemA.unitCostSnapshotUnits !== 300_000 ||
    itemA.estimatedCostUnits !== 600_000 ||
    itemA.estimatedProfitUnits !== 400_000 ||
    itemA.costStatus !== 'KNOWN' ||
    itemB?.subtotalUnits !== 750_000 ||
    itemB.unitCostSnapshotUnits !== null ||
    itemB.estimatedCostUnits !== null ||
    itemB.estimatedProfitUnits !== null ||
    itemB.costStatus !== 'UNKNOWN' ||
    stateA?.stock !== 8 ||
    stateB?.stock !== -1 ||
    movementRows.length !== 2 ||
    movementA?.quantityDelta !== -2 ||
    movementA.stockBefore !== 10 ||
    movementA.stockAfter !== 8 ||
    movementB?.quantityDelta !== -1 ||
    movementB.stockBefore !== 0 ||
    movementB.stockAfter !== -1
  ) {
    throw new Error('RegisterSale native success rows are incorrect.');
  }
}

async function assertRejects(operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
  } catch {
    return;
  }

  throw new Error('RegisterSale rollback smoke expected a failure.');
}
