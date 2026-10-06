import {
  Money,
  createSale,
  createSaleItem,
  createInventoryMovement,
  createInventoryState,
} from '@stock-app/domain';
import {
  decodeMoney,
  createSchemaValidator,
  registerSaleResultSchema,
  type OperationReceipt,
  type RegisterSaleCommandResult,
} from '@stock-app/contracts';
import type { SaleCommand } from './execute.js';

const validateResult = createSchemaValidator(registerSaleResultSchema);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const money = (value: string | null) =>
  value === null ? null : Money.fromScaledUnits(decodeMoney(value));
function indexed<T>(values: T[], key: (value: T) => string, count: number) {
  const map = new Map(values.map((v) => [key(v).toLowerCase(), v]));
  if (values.length !== count || map.size !== count)
    throw new Error('Invalid Sale ChangeSet identities.');
  return map;
}
export function reconstructSaleResult(
  receipt: OperationReceipt,
  command: SaleCommand,
): RegisterSaleCommandResult {
  if (
    receipt.status !== 'ACCEPTED' ||
    !same(receipt.operationId, command.operationId)
  )
    throw new Error('Invalid Sale receipt.');
  const changes = receipt.changeSet,
    upserts = changes.upserts,
    sale = upserts.sales[0],
    count = command.payload.items.length;
  if (
    upserts.sales.length !== 1 ||
    !sale ||
    !same(sale.id, command.payload.saleId) ||
    !same(sale.inventoryId, changes.inventoryId) ||
    sale.status !== 'CONFIRMED' ||
    sale.effectiveAt !== command.occurredAt ||
    sale.createdAt !== command.payload.createdAt ||
    sale.updatedAt !== command.payload.createdAt ||
    upserts.products.length ||
    upserts.purchases.length ||
    upserts.stockAdjustments.length ||
    changes.tombstones.length
  )
    throw new Error('Incomplete Sale ChangeSet.');
  const items = indexed(upserts.saleItems, (v) => v.id, count),
    movements = indexed(upserts.inventoryMovements, (v) => v.id, count),
    states = indexed(upserts.inventoryStates, (v) => v.productId, count);
  const expected = new Map(
    command.preconditions.expectedCosts.map((e) => [
      e.productId.toLowerCase(),
      e,
    ]),
  );
  const orderedItems = [],
    orderedMovements = [],
    orderedStates = [];
  let total = Money.zero(),
    cost = Money.zero(),
    profit = Money.zero(),
    allKnown = upserts.saleItems.every((item) => item.costStatus === 'KNOWN');
  for (const line of command.payload.items) {
    const item = items.get(line.saleItemId.toLowerCase()),
      movement = movements.get(line.movementId.toLowerCase()),
      state = states.get(line.productId.toLowerCase()),
      evidence = expected.get(line.productId.toLowerCase());
    if (
      !item ||
      !movement ||
      !state ||
      !evidence ||
      !same(item.inventoryId, changes.inventoryId) ||
      !same(item.saleId, sale.id) ||
      !same(item.productId, line.productId) ||
      item.quantity !== line.quantity ||
      item.unitSalePrice !== line.unitSalePrice ||
      item.createdAt !== sale.createdAt ||
      item.updatedAt !== sale.createdAt ||
      item.unitCostSnapshot !== evidence.unitCostSnapshot ||
      item.estimatedCost !== evidence.estimatedCost ||
      item.estimatedProfit !== evidence.estimatedProfit
    )
      throw new Error('Invalid SaleItem snapshot.');
    const domainItem = createSaleItem({
      ...item,
      unitSalePrice: Money.fromScaledUnits(decodeMoney(item.unitSalePrice)),
      subtotal: Money.fromScaledUnits(decodeMoney(item.subtotal)),
      unitCostSnapshot: money(item.unitCostSnapshot),
      estimatedCost: money(item.estimatedCost),
      estimatedProfit: money(item.estimatedProfit),
    });
    if (
      !same(movement.inventoryId, changes.inventoryId) ||
      !same(movement.productId, line.productId) ||
      movement.type !== 'SALE' ||
      movement.sourceType !== 'SALE' ||
      !movement.sourceId ||
      !same(movement.sourceId, sale.id) ||
      movement.quantityDelta !== -line.quantity ||
      movement.unitCostSnapshot !== item.unitCostSnapshot ||
      movement.effectiveAt !== sale.effectiveAt ||
      movement.createdAt !== sale.createdAt ||
      movement.updatedAt !== sale.createdAt ||
      movement.metadata !== null ||
      movement.reversalOfMovementId !== null
    )
      throw new Error('Invalid SALE movement.');
    createInventoryMovement({
      ...movement,
      unitCostSnapshot: money(movement.unitCostSnapshot),
      metadata: null,
    });
    if (
      !same(state.inventoryId, changes.inventoryId) ||
      !state.lastMovementId ||
      !same(state.lastMovementId, movement.id) ||
      state.stock !== movement.stockAfter ||
      state.unitCost !== movement.unitCostSnapshot ||
      BigInt(state.stateRevision) < 1n ||
      BigInt(state.stateRevision) > 9223372036854775807n
    )
      throw new Error('Invalid Sale state.');
    createInventoryState({
      stock: state.stock,
      unitCost: money(state.unitCost),
    });
    // Verify stored aggregates using exact Domain Money, never current DB state or a new price/cost.
    total = total.add(domainItem.subtotal);
    if (
      domainItem.estimatedCost === null ||
      domainItem.estimatedProfit === null
    )
      allKnown = false;
    else if (allKnown) {
      cost = cost.add(domainItem.estimatedCost);
      profit = profit.add(domainItem.estimatedProfit);
    }
    orderedItems.push(item);
    orderedMovements.push(movement);
    orderedStates.push(state);
  }
  if (
    sale.totalAmount !== String(total.scaledUnits) ||
    sale.estimatedCost !== (allKnown ? String(cost.scaledUnits) : null) ||
    sale.estimatedProfit !== (allKnown ? String(profit.scaledUnits) : null)
  )
    throw new Error('Invalid Sale totals.');
  const domainSale = createSale({
    ...sale,
    totalAmount: Money.fromScaledUnits(decodeMoney(sale.totalAmount)),
    estimatedCost: money(sale.estimatedCost),
    estimatedProfit: money(sale.estimatedProfit),
    notes: command.payload.notes,
  });
  if (sale.notes !== domainSale.notes) throw new Error('Invalid Sale notes.');
  const result = {
    sale,
    items: orderedItems,
    states: orderedStates,
    movements: orderedMovements,
    committedRevision: changes.revision,
    serverRecordedAt: changes.serverRecordedAt,
  };
  validateResult(result);
  return result;
}
