import type { TestContext } from 'node:test';
import type { CloudInventoryContext } from '../../src/infrastructure/postgres/command-executor.js';
import {
  executePurchaseCommand,
  type PurchaseCommand,
} from '../../src/purchases/execute.js';
import { engineFixture } from '../commands/helpers.js';
import { executeProductCommand } from '../../src/products/execute.js';
import { createCommand } from '../products/helpers.js';
import { id } from '../postgres/helpers.js';

export function purchaseCommand(
  productId: string,
  quantity = 10,
  unitCost = '12000000',
  preconditions: PurchaseCommand['preconditions'] = {
    expectedStateRevision: '0',
    expectedState: { stock: 0, unitCost: null, lastMovementId: null },
  },
): PurchaseCommand {
  return {
    operationId: id(),
    commandKind: 'PURCHASE_REGISTER',
    protocolVersion: 1,
    domainVersion: 1,
    occurredAt: 123,
    dependsOn: [],
    deviceId: null,
    payload: {
      purchaseId: id(),
      movementId: id(),
      productId,
      quantity,
      unitCost,
      notes: null,
      createdAt: 456,
    },
    preconditions,
  };
}
export async function purchasesFixture(t: TestContext) {
  const f = await engineFixture(t),
    context = await f.dataset();
  async function product(
    stock = 20,
    cost: string | null = '10000000',
    price = '15000000',
    scope = context,
  ) {
    const command = createCommand({
      initialStock: Math.max(stock, 0),
      initialUnitCost: stock > 0 ? cost : null,
      initialMovementId: stock > 0 ? id() : null,
      regularSalePrice: price,
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
  async function command(
    productId: string,
    quantity = 10,
    cost = '12000000',
    scope = context,
  ) {
    const row = (
      await f.pool.query(
        'SELECT * FROM inventory_states WHERE inventory_id=$1 AND product_id=$2',
        [scope.inventory.id, productId],
      )
    ).rows[0];
    return purchaseCommand(productId, quantity, cost, {
      expectedStateRevision: row.state_revision,
      expectedState: {
        stock: Number(row.stock),
        unitCost: row.unit_cost_units,
        lastMovementId: row.last_movement_id,
      },
    });
  }
  async function run(
    command: PurchaseCommand,
    scope: CloudInventoryContext = context,
  ) {
    return f.execute(
      f.input(scope, command, (tx, inventory) =>
        executePurchaseCommand(tx, inventory.id, command),
      ),
    );
  }
  return { ...f, context, product, command, run };
}
