import type { SaleVoidRepository } from '@stock-app/application';
import { and, asc, eq, gte, inArray } from 'drizzle-orm';

import type { AppDatabase } from '../database';
import {
  inventoryMovements,
  inventoryStates,
  saleItems,
  sales,
} from '../schema';
import {
  mapInventoryMovementRowToDomain,
  mapInventoryMovementToRow,
  mapInventoryStateRowToRecord,
  mapSaleItemRowToDomain,
  mapSaleRowToDomain,
} from './mappers';

type VoidSaleExecutor = Pick<AppDatabase['db'], 'insert' | 'select' | 'update'>;

export function createSqliteVoidSaleTransaction(
  executor: VoidSaleExecutor,
): SaleVoidRepository {
  return {
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
    async listReversals(inventoryId, originalMovementIds) {
      if (originalMovementIds.length === 0) return [];

      const rows = await executor
        .select()
        .from(inventoryMovements)
        .where(
          and(
            eq(inventoryMovements.inventoryId, inventoryId),
            eq(inventoryMovements.type, 'REVERSAL'),
            eq(inventoryMovements.sourceType, 'INVENTORY_MOVEMENT'),
            inArray(inventoryMovements.sourceId, originalMovementIds),
          ),
        )
        .orderBy(asc(inventoryMovements.createdAt), asc(inventoryMovements.id));

      return rows.map(mapInventoryMovementRowToDomain);
    },
    async listProductMovementsAtOrAfter({ inventoryId, productId, createdAt }) {
      const rows = await executor
        .select()
        .from(inventoryMovements)
        .where(
          and(
            eq(inventoryMovements.inventoryId, inventoryId),
            eq(inventoryMovements.productId, productId),
            gte(inventoryMovements.createdAt, createdAt),
          ),
        )
        .orderBy(asc(inventoryMovements.createdAt), asc(inventoryMovements.id));

      return rows.map(mapInventoryMovementRowToDomain);
    },
    async listInventoryStates(inventoryId) {
      const rows = await executor
        .select()
        .from(inventoryStates)
        .where(eq(inventoryStates.inventoryId, inventoryId))
        .orderBy(asc(inventoryStates.productId));

      return rows.map(mapInventoryStateRowToRecord);
    },
    async saveReversal(movement) {
      await executor
        .insert(inventoryMovements)
        .values(mapInventoryMovementToRow(movement))
        .run();
    },
    async updateInventoryState(input) {
      const result = await executor
        .update(inventoryStates)
        .set({
          stock: input.state.stock,
          unitCostUnits: input.state.unitCost?.scaledUnits ?? null,
        })
        .where(
          and(
            eq(inventoryStates.inventoryId, input.inventoryId),
            eq(inventoryStates.productId, input.productId),
          ),
        )
        .run();

      if (result.changes !== 1) {
        throw new Error(
          `Expected to update one InventoryState, updated ${result.changes}.`,
        );
      }
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
