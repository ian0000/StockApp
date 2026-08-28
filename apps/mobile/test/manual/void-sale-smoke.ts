import { and, eq } from 'drizzle-orm';
import { deleteDatabaseAsync } from 'expo-sqlite';

import { Money } from '@stock-app/domain';

import { createAppRuntime } from '../../src/composition/create-app-services';
import {
  inventoryMovements,
  inventoryStates,
  sales,
} from '../../src/infrastructure/sqlite/schema';

interface VoidSaleSmokeResult {
  readonly success: 'passed';
  readonly idempotency: 'passed';
  readonly rollback: 'passed';
  readonly reads: 'passed';
}

/**
 * Manual native-only integration smoke for Expo Go or a development build.
 * Invoke temporarily from a native entry. It uses and removes a dedicated DB.
 */
export async function runVoidSaleSmokeTest(): Promise<VoidSaleSmokeResult> {
  const databaseName = `stockapp-void-sale-${Date.now()}.db`;
  let runtime: Awaited<ReturnType<typeof createAppRuntime>> | undefined;

  try {
    runtime = await createAppRuntime({ databaseName });
    const { database, services } = runtime;
    const inventory = await services.createInventory.execute({
      name: 'Void sale smoke',
      currency: 'USD',
    });
    const productA = await services.createProduct.execute({
      inventoryId: inventory.id,
      name: 'Known cost',
      regularSalePrice: Money.fromDecimal('2'),
      initialStock: 10,
      initialUnitCost: Money.fromDecimal('0.30'),
    });
    const productB = await services.createProduct.execute({
      inventoryId: inventory.id,
      name: 'Unknown cost',
      regularSalePrice: Money.fromDecimal('1'),
      initialStock: 0,
      initialUnitCost: null,
    });
    const registered = await services.registerSale.execute({
      inventoryId: inventory.id,
      items: [
        {
          productId: productA.product.id,
          quantity: 12,
          unitSalePrice: Money.fromDecimal('2'),
        },
        {
          productId: productB.product.id,
          quantity: 1,
          unitSalePrice: Money.fromDecimal('1'),
        },
      ],
    });

    const first = await services.voidSale.execute({
      inventoryId: inventory.id,
      saleId: registered.sale.id,
    });
    const second = await services.voidSale.execute({
      inventoryId: inventory.id,
      saleId: registered.sale.id,
    });
    const reversalRows = database.db
      .select()
      .from(inventoryMovements)
      .where(eq(inventoryMovements.type, 'REVERSAL'))
      .all();
    const stateRows = database.db
      .select()
      .from(inventoryStates)
      .where(eq(inventoryStates.inventoryId, inventory.id))
      .all();
    const stateA = stateRows.find(
      ({ productId }) => productId === productA.product.id,
    );
    const stateB = stateRows.find(
      ({ productId }) => productId === productB.product.id,
    );

    if (
      first.kind !== 'VOIDED' ||
      second.kind !== 'ALREADY_VOIDED' ||
      reversalRows.length !== 2 ||
      reversalRows.some(
        (row) =>
          row.sourceType !== 'INVENTORY_MOVEMENT' || row.sourceId === null,
      ) ||
      stateA?.stock !== 10 ||
      stateA.unitCostUnits !== 300_000 ||
      stateB?.stock !== 0 ||
      stateB.unitCostUnits !== null
    ) {
      throw new Error(
        'VoidSale native success/idempotency rows are incorrect.',
      );
    }

    const summary = await services.getSalesSummary.execute({
      inventoryId: inventory.id,
      fromInclusive: 0,
      toExclusive: Number.MAX_SAFE_INTEGER,
    });
    const history = await services.listHistory.execute({
      inventoryId: inventory.id,
      limit: 10,
    });
    const details = await services.getSaleDetails.execute({
      inventoryId: inventory.id,
      saleId: registered.sale.id,
    });

    if (
      !summary.totalAmount.equals(Money.zero()) ||
      summary.unitsSold !== 0 ||
      history.length !== 1 ||
      history[0]?.type !== 'SALE' ||
      history[0].status !== 'VOIDED' ||
      details?.status !== 'VOIDED' ||
      details.items.length !== 2
    ) {
      throw new Error('VoidSale native read models are incorrect.');
    }

    const rollbackProduct = await services.createProduct.execute({
      inventoryId: inventory.id,
      name: 'Rollback product',
      regularSalePrice: Money.fromDecimal('2'),
      initialStock: 5,
      initialUnitCost: Money.fromDecimal('1'),
    });
    const rollbackSale = await services.registerSale.execute({
      inventoryId: inventory.id,
      items: [
        {
          productId: rollbackProduct.product.id,
          quantity: 2,
          unitSalePrice: Money.fromDecimal('2'),
        },
      ],
    });
    const original = database.db
      .select()
      .from(inventoryMovements)
      .where(
        and(
          eq(inventoryMovements.sourceType, 'SALE'),
          eq(inventoryMovements.sourceId, rollbackSale.sale.id),
        ),
      )
      .get();

    if (original === undefined)
      throw new Error('Rollback SALE movement missing.');

    await database.sqlite.execAsync(`
      CREATE TRIGGER void_sale_fail_status
      BEFORE UPDATE ON sales
      WHEN OLD.id = '${rollbackSale.sale.id}'
      BEGIN
        SELECT RAISE(ABORT, 'APP-VOID-SALE controlled final failure');
      END;
    `);
    await assertRejects(() =>
      services.voidSale.execute({
        inventoryId: inventory.id,
        saleId: rollbackSale.sale.id,
      }),
    );

    const persistedRollbackSale = database.db
      .select()
      .from(sales)
      .where(eq(sales.id, rollbackSale.sale.id))
      .get();
    const rollbackState = database.db
      .select()
      .from(inventoryStates)
      .where(eq(inventoryStates.productId, rollbackProduct.product.id))
      .get();
    const rollbackReversals = database.db
      .select()
      .from(inventoryMovements)
      .where(
        and(
          eq(inventoryMovements.type, 'REVERSAL'),
          eq(inventoryMovements.sourceId, original.id),
        ),
      )
      .all();

    if (
      persistedRollbackSale?.status !== 'CONFIRMED' ||
      rollbackState?.stock !== 3 ||
      rollbackReversals.length !== 0
    ) {
      throw new Error('VoidSale did not roll back all writes.');
    }

    return Object.freeze({
      success: 'passed',
      idempotency: 'passed',
      rollback: 'passed',
      reads: 'passed',
    });
  } finally {
    if (runtime !== undefined) await runtime.database.sqlite.closeAsync();
    await deleteDatabaseAsync(databaseName);
  }
}

async function assertRejects(operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
  } catch {
    return;
  }

  throw new Error('VoidSale rollback smoke expected a failure.');
}
