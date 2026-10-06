import type { TestContext } from 'node:test';
import {
  executeAdjustmentCommand,
  type AdjustmentCommand,
} from '../../src/adjustments/execute.js';
import { purchasesFixture } from '../purchases/helpers.js';
import { id } from '../postgres/helpers.js';

export function adjustmentCommand(
  productId: string,
  actualStock = 30,
  costMode: AdjustmentCommand['payload']['costMode'] = 'CUSTOM_COST',
  customUnitCost: string | null = '12000000',
  preconditions: AdjustmentCommand['preconditions'] = {
    expectedStateRevision: '0',
    expectedState: { stock: 0, unitCost: null, lastMovementId: null },
  },
): AdjustmentCommand {
  return {
    operationId: id(),
    commandKind: 'STOCK_ADJUST',
    protocolVersion: 1,
    domainVersion: 1,
    occurredAt: 123,
    dependsOn: [],
    deviceId: null,
    payload: {
      stockAdjustmentId: id(),
      movementId: id(),
      productId,
      actualStock,
      reason: 'COUNT_CORRECTION',
      costMode,
      customUnitCost,
      createdAt: 456,
    },
    preconditions,
  };
}
export async function adjustmentsFixture(t: TestContext) {
  const f = await purchasesFixture(t);
  async function command(
    productId: string,
    actualStock = 30,
    costMode: AdjustmentCommand['payload']['costMode'] = 'CUSTOM_COST',
    customUnitCost: string | null = '12000000',
    scope = f.context,
  ) {
    const purchase = await f.command(productId, 1, '0', scope);
    return adjustmentCommand(
      productId,
      actualStock,
      costMode,
      customUnitCost,
      purchase.preconditions,
    );
  }
  async function run(command: AdjustmentCommand, scope = f.context) {
    return f.execute(
      f.input(scope, command, (tx, inventory) =>
        executeAdjustmentCommand(tx, inventory.id, command),
      ),
    );
  }
  return { ...f, command, run, purchaseCommand: f.command, runPurchase: f.run };
}
