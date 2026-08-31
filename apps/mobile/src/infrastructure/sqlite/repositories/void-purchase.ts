import type { PurchaseVoidRepository } from '@stock-app/application';
import { and, asc, eq } from 'drizzle-orm';

import type { AppDatabase } from '../database';
import { inventoryMovements, purchases } from '../schema';
import {
  mapInventoryMovementRowToDomain,
  mapPurchaseRowToDomain,
} from './mappers';
import { createSqliteVoidOperationTransaction } from './void-operation';

type VoidPurchaseExecutor = Pick<
  AppDatabase['db'],
  'insert' | 'select' | 'update'
>;

export function createSqliteVoidPurchaseTransaction(
  executor: VoidPurchaseExecutor,
): PurchaseVoidRepository {
  return {
    ...createSqliteVoidOperationTransaction(executor),
    async findPurchase(inventoryId, purchaseId) {
      const rows = await executor
        .select()
        .from(purchases)
        .where(
          and(
            eq(purchases.inventoryId, inventoryId),
            eq(purchases.id, purchaseId),
          ),
        )
        .limit(1);

      const row = rows[0];
      return row === undefined ? null : mapPurchaseRowToDomain(row);
    },
    async listOriginalPurchaseMovements(inventoryId, purchaseId) {
      const rows = await executor
        .select()
        .from(inventoryMovements)
        .where(
          and(
            eq(inventoryMovements.inventoryId, inventoryId),
            eq(inventoryMovements.type, 'PURCHASE'),
            eq(inventoryMovements.sourceType, 'PURCHASE'),
            eq(inventoryMovements.sourceId, purchaseId),
          ),
        )
        .orderBy(asc(inventoryMovements.createdAt), asc(inventoryMovements.id));

      return rows.map(mapInventoryMovementRowToDomain);
    },
    async updatePurchase(purchase) {
      const result = await executor
        .update(purchases)
        .set({ status: purchase.status, updatedAt: purchase.updatedAt })
        .where(
          and(
            eq(purchases.inventoryId, purchase.inventoryId),
            eq(purchases.id, purchase.id),
            eq(purchases.status, 'CONFIRMED'),
          ),
        )
        .run();

      if (result.changes !== 1) {
        throw new Error(
          `Expected to void one Purchase, updated ${result.changes}.`,
        );
      }
    },
  };
}
