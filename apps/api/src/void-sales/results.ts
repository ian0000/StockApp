import {
  createSale,
  createInventoryMovement,
  type InventoryMovement,
} from '@stock-app/domain';
import {
  createSchemaValidator,
  voidSaleResultSchema,
  type VoidSaleCommand,
  type OperationReceipt,
  type VoidSaleCommandResult,
} from '@stock-app/contracts';
import { transportMoney } from '../purchases/mappers.js';
import { moneyTransport } from '../sales/mappers.js';

const validateResult = createSchemaValidator(voidSaleResultSchema),
  same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
export function reconstructVoidSaleResult(
  receipt: OperationReceipt,
  command: VoidSaleCommand,
  originals: readonly InventoryMovement[],
): VoidSaleCommandResult {
  if (
    receipt.status !== 'ACCEPTED' ||
    !same(receipt.operationId, command.operationId)
  )
    throw new Error('Invalid Sale void receipt.');
  const changes = receipt.changeSet,
    up = changes.upserts,
    sale = up.sales[0],
    count = command.payload.reversalMovements.length;
  if (
    !sale ||
    up.sales.length !== 1 ||
    sale.status !== 'VOIDED' ||
    !same(sale.id, command.payload.saleId) ||
    !same(sale.inventoryId, changes.inventoryId) ||
    !count ||
    up.inventoryMovements.length !== count ||
    up.inventoryStates.length !== count ||
    originals.length !== count ||
    up.products.length ||
    up.saleItems.length ||
    up.purchases.length ||
    up.stockAdjustments.length ||
    changes.tombstones.length ||
    new Set(up.inventoryMovements.map((m) => m.productId.toLowerCase()))
      .size !== count ||
    new Set(up.inventoryStates.map((s) => s.productId.toLowerCase())).size !==
      count ||
    new Set(originals.map((m) => m.productId.toLowerCase())).size !== count
  )
    throw new Error('Incomplete Sale void ChangeSet.');
  createSale({
    ...sale,
    totalAmount: transportMoney(sale.totalAmount)!,
    estimatedCost: transportMoney(sale.estimatedCost),
    estimatedProfit: transportMoney(sale.estimatedProfit),
  });
  // Immutable original SALE ledger verifies linkage and snapshots; all returned fields are durable ChangeSet DTOs.
  for (const identity of command.payload.reversalMovements) {
    const movement = up.inventoryMovements.find((m) =>
        same(m.productId, identity.productId),
      ),
      state = up.inventoryStates.find((s) =>
        same(s.productId, identity.productId),
      ),
      original = originals.find((m) => same(m.productId, identity.productId)),
      evidence = command.preconditions.states.find((s) =>
        same(s.productId, identity.productId),
      );
    if (
      !movement ||
      !state ||
      !original ||
      !evidence ||
      typeof evidence.expectedStateRevision !== 'string'
    )
      throw new Error('Incomplete Sale void evidence.');
    const revision = BigInt(evidence.expectedStateRevision),
      before = evidence.expectedState;
    if (
      !same(original.inventoryId, changes.inventoryId) ||
      original.type !== 'SALE' ||
      original.sourceType !== 'SALE' ||
      !original.sourceId ||
      !same(original.sourceId, sale.id) ||
      revision >= 9223372036854775807n ||
      !same(movement.id, identity.movementId) ||
      !same(movement.inventoryId, changes.inventoryId) ||
      movement.type !== 'REVERSAL' ||
      movement.sourceType !== 'INVENTORY_MOVEMENT' ||
      !movement.sourceId ||
      !same(movement.sourceId, original.id) ||
      !movement.reversalOfMovementId ||
      !same(movement.reversalOfMovementId, original.id) ||
      movement.quantityDelta !== -original.quantityDelta ||
      movement.stockBefore !== original.stockAfter ||
      movement.stockBefore !== before.stock ||
      movement.stockAfter !== original.stockBefore ||
      movement.unitCostSnapshot !== moneyTransport(original.unitCostSnapshot) ||
      movement.unitCostSnapshot !== before.unitCost ||
      movement.metadata !== null ||
      movement.effectiveAt !== command.occurredAt ||
      movement.createdAt !== command.payload.createdAt ||
      movement.updatedAt !== command.payload.createdAt
    )
      throw new Error('Invalid durable reversal.');
    createInventoryMovement({
      ...movement,
      metadata: null,
      unitCostSnapshot: transportMoney(movement.unitCostSnapshot),
    });
    if (
      !same(state.inventoryId, changes.inventoryId) ||
      state.stock !== movement.stockAfter ||
      state.unitCost !== movement.unitCostSnapshot ||
      BigInt(state.stateRevision) !== revision + 1n ||
      !state.lastMovementId ||
      !same(state.lastMovementId, movement.id)
    )
      throw new Error('Invalid durable void state.');
  }
  const result = {
    kind: 'VOIDED' as const,
    sale,
    reversals: up.inventoryMovements,
    states: up.inventoryStates,
    committedRevision: changes.revision,
    serverRecordedAt: changes.serverRecordedAt,
  };
  validateResult(result);
  return result;
}
