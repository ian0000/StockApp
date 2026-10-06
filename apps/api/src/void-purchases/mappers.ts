import { and, eq } from 'drizzle-orm';
import { createPurchase } from '@stock-app/domain';
import { decodeMoney } from '@stock-app/contracts';
import {
  purchases,
  inventoryMovements,
} from '../infrastructure/postgres/schema.js';
import type { CommandTransaction } from '../infrastructure/postgres/command-executor.js';
import type { OwnershipDatabase } from '../ownership/context.js';
import { transportMoney } from '../purchases/mappers.js';
import { movementFromRow } from '../void-sales/mappers.js';

export function purchaseFromRow(row: typeof purchases.$inferSelect) {
  if (row.status !== 'CONFIRMED' && row.status !== 'VOIDED')
    throw new Error('Invalid stored Purchase status.');
  return createPurchase({
    id: row.id,
    inventoryId: row.inventoryId,
    productId: row.productId,
    status: row.status,
    quantity: decodeMoney(row.quantity.toString()),
    unitCost: transportMoney(row.unitCostUnits.toString())!,
    totalAmount: transportMoney(row.totalAmountUnits.toString())!,
    averageCostBefore: transportMoney(
      row.averageCostBeforeUnits?.toString() ?? null,
    ),
    averageCostAfter: transportMoney(row.averageCostAfterUnits.toString())!,
    stockBefore: decodeMoney(row.stockBefore.toString()),
    stockAfter: decodeMoney(row.stockAfter.toString()),
    notes: row.notes,
    effectiveAt: decodeMoney(row.effectiveAt.toString()),
    createdAt: decodeMoney(row.createdAt.toString()),
    updatedAt: decodeMoney(row.updatedAt.toString()),
  });
}
export async function loadOriginalPurchaseMovements(
  reader: OwnershipDatabase | CommandTransaction,
  inventoryId: string,
  purchaseId: string,
) {
  return (
    await reader
      .select()
      .from(inventoryMovements)
      .where(
        and(
          eq(inventoryMovements.inventoryId, inventoryId),
          eq(inventoryMovements.type, 'PURCHASE'),
          eq(inventoryMovements.sourceType, 'PURCHASE'),
          eq(inventoryMovements.sourceId, purchaseId.toLowerCase()),
        ),
      )
  ).map(movementFromRow);
}
