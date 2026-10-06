import type { TestContext } from 'node:test';
import type { CloudInventoryContext } from '../../src/infrastructure/postgres/command-executor.js';
import {
  executeSaleCommand,
  type SaleCommand,
} from '../../src/sales/execute.js';
import { engineFixture } from '../commands/helpers.js';
import { executeProductCommand } from '../../src/products/execute.js';
import { createCommand } from '../products/helpers.js';
import { id } from '../postgres/helpers.js';

export interface SaleLineFixture {
  productId: string;
  quantity: number;
  price: string;
  cost: string | null;
  estimatedCost: string | null;
  estimatedProfit: string | null;
}
export function saleCommand(
  lines: readonly SaleLineFixture[],
  notes: string | null = null,
): SaleCommand {
  return {
    operationId: id(),
    commandKind: 'SALE_REGISTER',
    protocolVersion: 1,
    domainVersion: 1,
    occurredAt: 123,
    dependsOn: [],
    deviceId: null,
    payload: {
      saleId: id(),
      createdAt: 456,
      notes,
      items: lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        unitSalePrice: line.price,
        saleItemId: id(),
        movementId: id(),
      })),
    },
    preconditions: {
      expectedCosts: lines.map((line) => ({
        productId: line.productId,
        unitCostSnapshot: line.cost,
        estimatedCost: line.estimatedCost,
        estimatedProfit: line.estimatedProfit,
      })),
    },
  };
}
export async function salesFixture(t: TestContext) {
  const f = await engineFixture(t),
    context = await f.dataset();
  async function product(
    stock = 10,
    cost: string | null = '5000000',
    scope = context,
  ) {
    const command = createCommand({
      initialStock: Math.max(stock, 0),
      initialUnitCost: stock > 0 ? cost : null,
      initialMovementId: stock > 0 ? id() : null,
    });
    await f.execute(
      f.input(scope, command, (tx, inventory) =>
        executeProductCommand(tx, inventory.id, command),
      ),
    );
    if (stock <= 0)
      await f.pool.query(
        'UPDATE inventory_states SET stock=$1,unit_cost_units=$2 WHERE inventory_id=$3 AND product_id=$4',
        [String(stock), cost, scope.inventory.id, command.payload.productId],
      );
    return command.payload.productId;
  }
  async function run(
    command: SaleCommand,
    scope: CloudInventoryContext = context,
  ) {
    return f.execute(
      f.input(scope, command, (tx, inventory) =>
        executeSaleCommand(tx, inventory.id, command),
      ),
    );
  }
  return { ...f, context, product, run };
}
