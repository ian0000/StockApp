import type { TestContext } from 'node:test';
import type {
  VoidPurchaseCommand,
  OperationReceipt,
} from '@stock-app/contracts';
import { purchasesFixture } from '../purchases/helpers.js';
import { id } from '../postgres/helpers.js';
import { executeVoidPurchaseCommand } from '../../src/void-purchases/execute.js';
import { reconstructVoidPurchaseResult } from '../../src/void-purchases/results.js';
import { loadOriginalPurchaseMovements } from '../../src/void-purchases/mappers.js';

export function voidPurchaseCommand(
  purchaseId: string,
  preconditions: VoidPurchaseCommand['preconditions'],
): VoidPurchaseCommand {
  return {
    operationId: id(),
    commandKind: 'PURCHASE_VOID',
    protocolVersion: 1,
    domainVersion: 1,
    occurredAt: 1500,
    dependsOn: [],
    deviceId: null,
    payload: { purchaseId, reversalMovementId: id(), createdAt: 1600 },
    preconditions,
  };
}
export async function voidPurchasesFixture(t: TestContext) {
  const f = await purchasesFixture(t);
  async function purchase(
    stock = 20,
    beforeCost: string | null = '10000000',
    quantity = 10,
    incomingCost = '12000000',
    scope = f.context,
  ) {
    const productId = await f.product(stock, beforeCost, '15000000', scope);
    const command = await f.command(productId, quantity, incomingCost, scope);
    command.occurredAt = 900;
    command.payload.createdAt = 1000;
    await f.run(command, scope);
    return command;
  }
  async function command(purchaseId: string, scope = f.context) {
    const row = (
      await f.pool.query(
        'SELECT s.* FROM inventory_states s JOIN purchases p ON p.inventory_id=s.inventory_id AND p.product_id=s.product_id WHERE p.inventory_id=$1 AND p.id=$2',
        [scope.inventory.id, purchaseId],
      )
    ).rows[0];
    if (!row) throw new Error('Missing fixture purchase state.');
    return voidPurchaseCommand(purchaseId, {
      expectedStateRevision: row.state_revision,
      expectedState: {
        stock: Number(row.stock),
        unitCost: row.unit_cost_units,
        lastMovementId: row.last_movement_id,
      },
    });
  }
  async function run(command: VoidPurchaseCommand, scope = f.context) {
    return f.execute(
      f.input(scope, command, (tx, inventory) =>
        executeVoidPurchaseCommand(tx, inventory.id, command, () => 2000),
      ),
    );
  }
  async function result(
    receipt: OperationReceipt,
    command: VoidPurchaseCommand,
    scope = f.context,
  ) {
    return reconstructVoidPurchaseResult(
      receipt,
      command,
      await loadOriginalPurchaseMovements(
        f.db,
        scope.inventory.id,
        command.payload.purchaseId,
      ),
    );
  }
  return {
    ...f,
    purchase,
    command,
    run,
    result,
    runPurchase: f.run,
    purchaseCommand: f.command,
  };
}
