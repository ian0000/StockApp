import { and, eq } from 'drizzle-orm';
import {
  createSale,
  createSaleItem,
  createInventoryMovement,
} from '@stock-app/domain';
import {
  createSchemaValidator,
  contractSchemas,
  decodeMoney,
  type InventoryMovementDto,
} from '@stock-app/contracts';
import {
  sales,
  saleItems,
  inventoryMovements,
} from '../infrastructure/postgres/schema.js';
import type { CommandTransaction } from '../infrastructure/postgres/command-executor.js';
import type { OwnershipDatabase } from '../ownership/context.js';
import { transportMoney } from '../purchases/mappers.js';

export function saleFromRow(row: typeof sales.$inferSelect) {
  if (row.status !== 'CONFIRMED' && row.status !== 'VOIDED')
    throw new Error('Invalid stored Sale status.');
  return createSale({
    id: row.id,
    inventoryId: row.inventoryId,
    status: row.status,
    totalAmount: transportMoney(row.totalAmountUnits.toString())!,
    estimatedCost: transportMoney(row.estimatedCostUnits?.toString() ?? null),
    estimatedProfit: transportMoney(
      row.estimatedProfitUnits?.toString() ?? null,
    ),
    notes: row.notes,
    effectiveAt: decodeMoney(row.effectiveAt.toString()),
    createdAt: decodeMoney(row.createdAt.toString()),
    updatedAt: decodeMoney(row.updatedAt.toString()),
  });
}
export function itemFromRow(row: typeof saleItems.$inferSelect) {
  if (row.costStatus !== 'KNOWN' && row.costStatus !== 'UNKNOWN')
    throw new Error('Invalid stored SaleItem cost status.');
  return createSaleItem({
    id: row.id,
    saleId: row.saleId,
    productId: row.productId,
    quantity: decodeMoney(row.quantity.toString()),
    unitSalePrice: transportMoney(row.unitSalePriceUnits.toString())!,
    subtotal: transportMoney(row.subtotalUnits.toString())!,
    unitCostSnapshot: transportMoney(
      row.unitCostSnapshotUnits?.toString() ?? null,
    ),
    estimatedCost: transportMoney(row.estimatedCostUnits?.toString() ?? null),
    estimatedProfit: transportMoney(
      row.estimatedProfitUnits?.toString() ?? null,
    ),
    costStatus: row.costStatus,
    createdAt: decodeMoney(row.createdAt.toString()),
    updatedAt: decodeMoney(row.updatedAt.toString()),
  });
}
const validateMovement = createSchemaValidator(
  contractSchemas.InventoryMovement,
);
function assertMovement(value: unknown): asserts value is InventoryMovementDto {
  validateMovement(value);
}
export function movementFromRow(row: typeof inventoryMovements.$inferSelect) {
  const value = {
    id: row.id,
    inventoryId: row.inventoryId,
    productId: row.productId,
    type: row.type,
    quantityDelta: decodeMoney(row.quantityDelta.toString()),
    unitCostSnapshot: row.unitCostSnapshotUnits?.toString() ?? null,
    stockBefore: decodeMoney(row.stockBefore.toString()),
    stockAfter: decodeMoney(row.stockAfter.toString()),
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    metadata: row.metadata,
    reversalOfMovementId: row.reversalOfMovementId,
    effectiveAt: decodeMoney(row.effectiveAt.toString()),
    createdAt: decodeMoney(row.createdAt.toString()),
    updatedAt: decodeMoney(row.updatedAt.toString()),
  };
  assertMovement(value);
  if (value.metadata !== null)
    throw new Error('Invalid stored movement metadata.');
  return createInventoryMovement({
    ...value,
    metadata: null,
    unitCostSnapshot: transportMoney(value.unitCostSnapshot),
  });
}
export async function loadOriginalSaleMovements(
  reader: OwnershipDatabase | CommandTransaction,
  inventoryId: string,
  saleId: string,
) {
  const rows = await reader
    .select()
    .from(inventoryMovements)
    .where(
      and(
        eq(inventoryMovements.inventoryId, inventoryId),
        eq(inventoryMovements.type, 'SALE'),
        eq(inventoryMovements.sourceType, 'SALE'),
        eq(inventoryMovements.sourceId, saleId.toLowerCase()),
      ),
    );
  return rows.map(movementFromRow);
}
