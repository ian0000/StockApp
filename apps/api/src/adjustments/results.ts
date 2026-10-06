import {
  createStockAdjustment,
  createInventoryState,
  createInventoryMovement,
  applyStockAdjustment,
} from '@stock-app/domain';
import {
  createSchemaValidator,
  adjustStockResultSchema,
  type OperationReceipt,
  type AdjustStockCommandResult,
} from '@stock-app/contracts';
import { transportMoney } from '../purchases/mappers.js';
import { moneyTransport } from '../sales/mappers.js';
import type { AdjustmentCommand } from './execute.js';

const validateResult = createSchemaValidator(adjustStockResultSchema),
  same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
export function reconstructAdjustmentResult(
  receipt: OperationReceipt,
  command: AdjustmentCommand,
): AdjustStockCommandResult {
  if (
    receipt.status !== 'ACCEPTED' ||
    !same(receipt.operationId, command.operationId) ||
    typeof command.preconditions.expectedStateRevision !== 'string'
  )
    throw new Error('Invalid adjustment receipt.');
  const changes = receipt.changeSet,
    up = changes.upserts,
    adjustment = up.stockAdjustments[0],
    movement = up.inventoryMovements[0],
    state = up.inventoryStates[0],
    expected = command.preconditions.expectedState;
  if (
    up.stockAdjustments.length !== 1 ||
    up.inventoryMovements.length !== 1 ||
    up.inventoryStates.length !== 1 ||
    up.products.length ||
    up.purchases.length ||
    up.sales.length ||
    up.saleItems.length ||
    changes.tombstones.length ||
    !adjustment ||
    !movement ||
    !state
  )
    throw new Error('Incomplete adjustment ChangeSet.');
  if (
    !same(adjustment.id, command.payload.stockAdjustmentId) ||
    !same(adjustment.inventoryId, changes.inventoryId) ||
    !same(adjustment.productId, command.payload.productId) ||
    adjustment.stockBefore !== expected.stock ||
    adjustment.actualStock !== command.payload.actualStock ||
    adjustment.reason !== command.payload.reason ||
    adjustment.costMode !== command.payload.costMode ||
    adjustment.effectiveAt !== command.occurredAt ||
    adjustment.createdAt !== command.payload.createdAt ||
    adjustment.updatedAt !== adjustment.createdAt
  )
    throw new Error('Invalid adjustment snapshot.');
  createStockAdjustment({
    ...adjustment,
    unitCost: transportMoney(adjustment.unitCost),
  });
  // Verify historical financial evidence with the existing Domain; response fields remain durable DTOs.
  const applied = applyStockAdjustment({
    inventory: createInventoryState({
      stock: expected.stock,
      unitCost: transportMoney(expected.unitCost),
    }),
    actualStock: command.payload.actualStock,
    costMode: command.payload.costMode,
    customUnitCost: transportMoney(command.payload.customUnitCost),
  });
  if (
    adjustment.difference !== applied.difference ||
    adjustment.unitCost !== moneyTransport(applied.unitCost)
  )
    throw new Error('Invalid adjustment cost/difference.');
  if (
    !same(movement.id, command.payload.movementId) ||
    !same(movement.inventoryId, changes.inventoryId) ||
    !same(movement.productId, adjustment.productId) ||
    movement.type !==
      (adjustment.difference > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT') ||
    movement.quantityDelta !== adjustment.difference ||
    movement.stockBefore !== adjustment.stockBefore ||
    movement.stockAfter !== adjustment.actualStock ||
    movement.unitCostSnapshot !== adjustment.unitCost ||
    movement.sourceType !== 'STOCK_ADJUSTMENT' ||
    !movement.sourceId ||
    !same(movement.sourceId, adjustment.id) ||
    movement.metadata !== null ||
    movement.reversalOfMovementId !== null ||
    movement.effectiveAt !== adjustment.effectiveAt ||
    movement.createdAt !== adjustment.createdAt ||
    movement.updatedAt !== adjustment.createdAt
  )
    throw new Error('Invalid adjustment movement.');
  createInventoryMovement({
    ...movement,
    unitCostSnapshot: transportMoney(movement.unitCostSnapshot),
    metadata: null,
  });
  const beforeRevision = BigInt(command.preconditions.expectedStateRevision);
  if (
    beforeRevision >= 9223372036854775807n ||
    !same(state.inventoryId, changes.inventoryId) ||
    !same(state.productId, adjustment.productId) ||
    state.stock !== applied.inventory.stock ||
    state.unitCost !== moneyTransport(applied.inventory.unitCost) ||
    BigInt(state.stateRevision) !== beforeRevision + 1n ||
    !state.lastMovementId ||
    !same(state.lastMovementId, movement.id)
  )
    throw new Error('Invalid adjustment state.');
  const result = {
    adjustment,
    state,
    movement,
    committedRevision: changes.revision,
    serverRecordedAt: changes.serverRecordedAt,
  };
  validateResult(result);
  return result;
}
