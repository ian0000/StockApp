import {
  createPurchase,
  createInventoryMovement,
  type InventoryMovement,
} from '@stock-app/domain';
import {
  createSchemaValidator,
  voidPurchaseResultSchema,
  type VoidPurchaseCommand,
  type OperationReceipt,
  type VoidPurchaseCommandResult,
} from '@stock-app/contracts';
import { transportMoney } from '../purchases/mappers.js';
import { moneyTransport } from '../sales/mappers.js';

const validateResult = createSchemaValidator(voidPurchaseResultSchema),
  same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
export function reconstructVoidPurchaseResult(
  receipt: OperationReceipt,
  command: VoidPurchaseCommand,
  originals: readonly InventoryMovement[],
): VoidPurchaseCommandResult {
  if (
    receipt.status !== 'ACCEPTED' ||
    !same(receipt.operationId, command.operationId)
  )
    throw new Error('Invalid Purchase void receipt.');
  const changes = receipt.changeSet,
    up = changes.upserts,
    purchase = up.purchases[0],
    movement = up.inventoryMovements[0],
    state = up.inventoryStates[0],
    original = originals[0],
    evidence = command.preconditions;
  if (
    !purchase ||
    !movement ||
    !state ||
    !original ||
    originals.length !== 1 ||
    up.purchases.length !== 1 ||
    up.inventoryMovements.length !== 1 ||
    up.inventoryStates.length !== 1 ||
    up.products.length ||
    up.sales.length ||
    up.saleItems.length ||
    up.stockAdjustments.length ||
    changes.tombstones.length ||
    purchase.status !== 'VOIDED' ||
    !same(purchase.id, command.payload.purchaseId) ||
    !same(purchase.inventoryId, changes.inventoryId) ||
    typeof evidence.expectedStateRevision !== 'string'
  )
    throw new Error('Incomplete Purchase void ChangeSet.');
  createPurchase({
    ...purchase,
    unitCost: transportMoney(purchase.unitCost)!,
    totalAmount: transportMoney(purchase.totalAmount)!,
    averageCostBefore: transportMoney(purchase.averageCostBefore),
    averageCostAfter: transportMoney(purchase.averageCostAfter)!,
  });
  // The immutable original ledger verifies linkage only; every returned field comes from the durable ChangeSet.
  const revision = BigInt(evidence.expectedStateRevision),
    before = evidence.expectedState;
  if (
    original.type !== 'PURCHASE' ||
    original.sourceType !== 'PURCHASE' ||
    !original.sourceId ||
    !same(original.sourceId, purchase.id) ||
    !same(original.inventoryId, changes.inventoryId) ||
    !same(original.productId, purchase.productId) ||
    original.quantityDelta !== purchase.quantity ||
    original.stockBefore !== purchase.stockBefore ||
    original.stockAfter !== purchase.stockAfter ||
    moneyTransport(original.unitCostSnapshot) !== purchase.unitCost ||
    revision >= 9223372036854775807n ||
    !same(movement.id, command.payload.reversalMovementId) ||
    !same(movement.inventoryId, changes.inventoryId) ||
    !same(movement.productId, purchase.productId) ||
    movement.type !== 'REVERSAL' ||
    movement.sourceType !== 'INVENTORY_MOVEMENT' ||
    !movement.sourceId ||
    !same(movement.sourceId, original.id) ||
    !movement.reversalOfMovementId ||
    !same(movement.reversalOfMovementId, original.id) ||
    movement.quantityDelta !== -purchase.quantity ||
    movement.stockBefore !== purchase.stockAfter ||
    movement.stockBefore !== before.stock ||
    before.unitCost !== purchase.averageCostAfter ||
    movement.stockAfter !== purchase.stockBefore ||
    movement.unitCostSnapshot !== purchase.unitCost ||
    movement.metadata !== null ||
    movement.effectiveAt !== command.occurredAt ||
    movement.createdAt !== command.payload.createdAt ||
    movement.updatedAt !== command.payload.createdAt
  )
    throw new Error('Invalid durable Purchase reversal.');
  createInventoryMovement({
    ...movement,
    metadata: null,
    unitCostSnapshot: transportMoney(movement.unitCostSnapshot),
  });
  if (
    !same(state.inventoryId, changes.inventoryId) ||
    !same(state.productId, purchase.productId) ||
    state.stock !== purchase.stockBefore ||
    state.unitCost !== purchase.averageCostBefore ||
    BigInt(state.stateRevision) !== revision + 1n ||
    !state.lastMovementId ||
    !same(state.lastMovementId, movement.id)
  )
    throw new Error('Invalid durable Purchase restored state.');
  const result = {
    kind: 'VOIDED' as const,
    purchase,
    reversals: up.inventoryMovements,
    states: up.inventoryStates,
    committedRevision: changes.revision,
    serverRecordedAt: changes.serverRecordedAt,
  };
  validateResult(result);
  return result;
}
