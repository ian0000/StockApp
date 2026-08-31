import type { SaleVoidRepository } from '@stock-app/application';
import { and, asc, eq } from 'drizzle-orm';

import type { AppDatabase } from '../database';
import { inventoryMovements, saleItems, sales } from '../schema';
import {
  mapInventoryMovementRowToDomain,
  mapSaleItemRowToDomain,
  mapSaleRowToDomain,
} from './mappers';
import { createSqliteVoidOperationTransaction } from './void-operation';

type VoidSaleExecutor = Pick<AppDatabase['db'], 'insert' | 'select' | 'update'>;

export function createSqliteVoidSaleTransaction(
  executor: VoidSaleExecutor,
): SaleVoidRepository {
  return {
    ...createSqliteVoidOperationTransaction(executor),
    async findSale(inventoryId, saleId) {
      const rows = await executor
        .select()
        .from(sales)
        .where(and(eq(sales.inventoryId, inventoryId), eq(sales.id, saleId)))
        .limit(1);

      const row = rows[0];
      return row === undefined ? null : mapSaleRowToDomain(row);
    },
    async listSaleItems(saleId) {
      const rows = await executor
        .select()
        .from(saleItems)
        .where(eq(saleItems.saleId, saleId))
        .orderBy(asc(saleItems.createdAt), asc(saleItems.id));

      return rows.map(mapSaleItemRowToDomain);
    },
    async listOriginalSaleMovements(inventoryId, saleId) {
      const rows = await executor
        .select()
        .from(inventoryMovements)
        .where(
          and(
            eq(inventoryMovements.inventoryId, inventoryId),
            eq(inventoryMovements.type, 'SALE'),
            eq(inventoryMovements.sourceType, 'SALE'),
            eq(inventoryMovements.sourceId, saleId),
          ),
        )
        .orderBy(asc(inventoryMovements.createdAt), asc(inventoryMovements.id));

      return rows.map(mapInventoryMovementRowToDomain);
    },
    async updateSale(sale) {
      const result = await executor
        .update(sales)
        .set({ status: sale.status, updatedAt: sale.updatedAt })
        .where(
          and(
            eq(sales.inventoryId, sale.inventoryId),
            eq(sales.id, sale.id),
            eq(sales.status, 'CONFIRMED'),
          ),
        )
        .run();

      if (result.changes !== 1) {
        throw new Error(
          `Expected to void one Sale, updated ${result.changes}.`,
        );
      }
    },
  };
}
