import { createPurchasePriceAnalysis } from '@stock-app/application';
import {
  createPurchase,
  createProduct,
  createInventoryState,
  createInventoryMovement,
  Money,
} from '@stock-app/domain';
import {
  createSchemaValidator,
  registerPurchaseResultSchema,
  decodeMoney,
  type OperationReceipt,
  type RegisterPurchaseCommandResult,
} from '@stock-app/contracts';
import { stateDto } from '../products/mappers.js';
import { priceAnalysisDto, transportMoney } from './mappers.js';
import type { PurchaseCommand } from './execute.js';

const validateResult = createSchemaValidator(registerPurchaseResultSchema);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
export function reconstructPurchaseResult(
  receipt: OperationReceipt,
  command: PurchaseCommand,
): RegisterPurchaseCommandResult {
  if (
    receipt.status !== 'ACCEPTED' ||
    !same(receipt.operationId, command.operationId) ||
    typeof command.preconditions.expectedStateRevision !== 'string'
  )
    throw new Error('Invalid Purchase receipt.');
  const changes = receipt.changeSet,
    up = changes.upserts,
    purchase = up.purchases[0],
    product = up.products[0],
    movement = up.inventoryMovements[0],
    afterState = up.inventoryStates[0],
    expected = command.preconditions.expectedState;
  if (
    up.purchases.length !== 1 ||
    up.products.length !== 1 ||
    up.inventoryMovements.length !== 1 ||
    up.inventoryStates.length !== 1 ||
    up.sales.length ||
    up.saleItems.length ||
    up.stockAdjustments.length ||
    changes.tombstones.length ||
    !purchase ||
    !product ||
    !movement ||
    !afterState
  )
    throw new Error('Incomplete Purchase ChangeSet.');
  if (
    !same(purchase.id, command.payload.purchaseId) ||
    !same(purchase.inventoryId, changes.inventoryId) ||
    !same(purchase.productId, command.payload.productId) ||
    purchase.quantity !== command.payload.quantity ||
    purchase.unitCost !== command.payload.unitCost ||
    purchase.status !== 'CONFIRMED' ||
    purchase.effectiveAt !== command.occurredAt ||
    purchase.createdAt !== command.payload.createdAt ||
    purchase.updatedAt !== purchase.createdAt ||
    purchase.stockBefore !== expected.stock ||
    purchase.averageCostBefore !== expected.unitCost
  )
    throw new Error('Invalid Purchase snapshots.');
  if (
    !same(product.id, command.payload.productId) ||
    !same(product.inventoryId, changes.inventoryId) ||
    product.isArchived ||
    BigInt(product.metadataRevision) < 0n ||
    BigInt(product.metadataRevision) > 9223372036854775807n
  )
    throw new Error('Invalid Purchase Product snapshot.');
  const domainProduct = createProduct({
    ...product,
    regularSalePrice: Money.fromScaledUnits(
      decodeMoney(product.regularSalePrice),
    ),
  });
  const beforeInventoryState = createInventoryState({
    stock: expected.stock,
    unitCost: transportMoney(expected.unitCost),
  });
  const beforeRevision = BigInt(command.preconditions.expectedStateRevision);
  if (beforeRevision < 0n || beforeRevision >= 9223372036854775807n)
    throw new Error('Invalid Purchase before revision.');
  const beforeState = stateDto(
    changes.inventoryId,
    product.id,
    beforeInventoryState,
    expected.lastMovementId?.toLowerCase() ?? null,
    beforeRevision,
  );
  // Domain validates total, stock transition and approved weighted average from historical snapshots.
  const domainPurchase = createPurchase({
    ...purchase,
    notes: command.payload.notes,
    unitCost: Money.fromScaledUnits(decodeMoney(purchase.unitCost)),
    totalAmount: Money.fromScaledUnits(decodeMoney(purchase.totalAmount)),
    averageCostBefore: transportMoney(purchase.averageCostBefore),
    averageCostAfter: Money.fromScaledUnits(
      decodeMoney(purchase.averageCostAfter),
    ),
  });
  if (purchase.notes !== domainPurchase.notes)
    throw new Error('Invalid Purchase notes.');
  if (
    !same(movement.id, command.payload.movementId) ||
    !same(movement.inventoryId, changes.inventoryId) ||
    !same(movement.productId, product.id) ||
    movement.type !== 'PURCHASE' ||
    movement.quantityDelta !== purchase.quantity ||
    movement.stockBefore !== purchase.stockBefore ||
    movement.stockAfter !== purchase.stockAfter ||
    movement.unitCostSnapshot !== purchase.unitCost ||
    movement.sourceType !== 'PURCHASE' ||
    !movement.sourceId ||
    !same(movement.sourceId, purchase.id) ||
    movement.metadata !== null ||
    movement.reversalOfMovementId !== null ||
    movement.effectiveAt !== purchase.effectiveAt ||
    movement.createdAt !== purchase.createdAt ||
    movement.updatedAt !== purchase.createdAt
  )
    throw new Error('Invalid PURCHASE movement.');
  createInventoryMovement({
    ...movement,
    unitCostSnapshot: transportMoney(movement.unitCostSnapshot),
    metadata: null,
  });
  if (
    !same(afterState.inventoryId, changes.inventoryId) ||
    !same(afterState.productId, product.id) ||
    afterState.stock !== purchase.stockAfter ||
    afterState.unitCost !== purchase.averageCostAfter ||
    BigInt(afterState.stateRevision) !== beforeRevision + 1n ||
    !afterState.lastMovementId ||
    !same(afterState.lastMovementId, movement.id)
  )
    throw new Error('Invalid Purchase after state.');
  const afterInventoryState = createInventoryState({
    stock: afterState.stock,
    unitCost: transportMoney(afterState.unitCost),
  });
  // Reuse Application against the durable Product snapshot, never current DB metadata/state.
  const priceAnalysis = priceAnalysisDto(
    createPurchasePriceAnalysis({
      beforeInventoryState,
      afterInventoryState,
      regularSalePrice: domainProduct.regularSalePrice,
    }),
  );
  const result = {
    purchase,
    product,
    beforeState,
    afterState,
    movement,
    priceAnalysis,
    committedRevision: changes.revision,
    serverRecordedAt: changes.serverRecordedAt,
  };
  validateResult(result);
  return result;
}
