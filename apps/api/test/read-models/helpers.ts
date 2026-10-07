import type { TestContext } from 'node:test';
import { voidPurchasesFixture } from '../void-purchases/helpers.js';
import { saleCommand } from '../sales/helpers.js';
import { executeSaleCommand } from '../../src/sales/execute.js';
import { executeVoidSaleCommand } from '../../src/void-sales/execute.js';
import { voidCommand } from '../void-sales/helpers.js';
import { adjustmentCommand } from '../adjustments/helpers.js';
import { executeAdjustmentCommand } from '../../src/adjustments/execute.js';
import { createReadCursor } from '../../src/read-models/cursor.js';
import type { ReadDatabase } from '../../src/read-models/products.js';

export async function readFixture(t: TestContext) {
  const f = await voidPurchasesFixture(t),
    codec = createReadCursor('fictional-api08-fixture-cursor-secret');
  async function sold(
    cost: string | null = '10000000',
    scope = f.context,
    time = 1000,
    quantity = 2,
    existingProductId?: string,
  ) {
    const productId =
      existingProductId ??
      (await f.product(cost === null ? 0 : 20, cost, '15000000', scope));
    const command = saleCommand([
      {
        productId,
        quantity,
        price: '15000000',
        cost,
        estimatedCost:
          cost === null ? null : (BigInt(cost) * BigInt(quantity)).toString(),
        estimatedProfit:
          cost === null
            ? null
            : ((15000000n - BigInt(cost)) * BigInt(quantity)).toString(),
      },
    ]);
    command.occurredAt = time;
    command.payload.createdAt = time + 100;
    await f.execute(
      f.input(scope, command, (tx, inv) =>
        executeSaleCommand(tx, inv.id, command),
      ),
    );
    return command;
  }
  async function voidSale(
    command: Awaited<ReturnType<typeof sold>>,
    scope = f.context,
  ) {
    const productId = command.payload.items[0].productId,
      row = (
        await f.pool.query(
          'SELECT * FROM inventory_states WHERE inventory_id=$1 AND product_id=$2',
          [scope.inventory.id, productId],
        )
      ).rows[0];
    const next = voidCommand(command.payload.saleId, [
      {
        productId,
        expectedStateRevision: row.state_revision,
        expectedState: {
          stock: Number(row.stock),
          unitCost: row.unit_cost_units,
          lastMovementId: row.last_movement_id,
        },
      },
    ]);
    next.occurredAt = command.occurredAt + 500;
    next.payload.createdAt = command.payload.createdAt + 500;
    return f.execute(
      f.input(scope, next, (tx, inv) =>
        executeVoidSaleCommand(
          tx,
          inv.id,
          next,
          () => next.payload.createdAt + 100,
        ),
      ),
    );
  }
  async function adjust(productId: string, actual: number, time = 2000) {
    const row = (
      await f.pool.query('SELECT * FROM inventory_states WHERE product_id=$1', [
        productId,
      ])
    ).rows[0];
    const command = adjustmentCommand(
      productId,
      actual,
      'USE_CURRENT_COST',
      null,
      {
        expectedStateRevision: row.state_revision,
        expectedState: {
          stock: Number(row.stock),
          unitCost: row.unit_cost_units,
          lastMovementId: row.last_movement_id,
        },
      },
    );
    command.occurredAt = time;
    command.payload.createdAt = time + 100;
    await f.execute(
      f.input(f.context, command, (tx, inv) =>
        executeAdjustmentCommand(tx, inv.id, command),
      ),
    );
    return command;
  }
  const scope = (
    route: string,
    search = '',
    inventoryId = f.context.inventory.id,
  ) => ({ inventoryId, route, search });
  const read = <T>(callback: (db: ReadDatabase) => Promise<T>) =>
    f.db.transaction(callback, {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    });
  return { ...f, codec, sold, voidSale, adjust, scope, read };
}
