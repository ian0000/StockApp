import type { InventoryOperationVoidRepository } from '@stock-app/application';
import { and, asc, eq, gte, inArray } from 'drizzle-orm';

import type { AppDatabase } from '../database';
import { inventoryMovements, inventoryStates } from '../schema';
import {
  mapInventoryMovementRowToDomain,
  mapInventoryMovementToRow,
  mapInventoryStateRowToRecord,
} from './mappers';

export type VoidOperationExecutor = Pick<
  AppDatabase['db'],
  'insert' | 'select' | 'update'
>;

export function createSqliteVoidOperationTransaction(
  executor: VoidOperationExecutor,
): InventoryOperationVoidRepository {
  return {
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
  };
}
