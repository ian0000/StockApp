import type {
  InventoryRepository,
  InventoryMovementRepository,
  InventoryStateRepository,
  ProductRepository,
  TransactionRepositories,
} from '@stock-app/application';
import { and, asc, desc, eq } from 'drizzle-orm';

import type { AppDatabase } from '../database';
import {
  inventories,
  inventoryMovements,
  inventoryStates,
  products,
} from '../schema';
import {
  mapInventoryToRow,
  mapInventoryRowToDomain,
  mapInventoryMovementToRow,
  mapInventoryStateRowToRecord,
  mapInventoryStateToRow,
  mapProductRowToDomain,
  mapProductToRow,
} from './mappers';

type SqliteRepositoryExecutor = Pick<AppDatabase['db'], 'insert' | 'select'>;

export function createInventoryRepository(
  executor: SqliteRepositoryExecutor,
): InventoryRepository {
  return {
    async list() {
      const rows = await executor.select().from(inventories);

      return rows.map(mapInventoryRowToDomain);
    },
    async save(inventory) {
      executor.insert(inventories).values(mapInventoryToRow(inventory)).run();
    },
  };
}

export function createSqliteProductRepository(
  executor: SqliteRepositoryExecutor,
): ProductRepository {
  return {
    async listByInventory(inventoryId) {
      const rows = await executor
        .select()
        .from(products)
        .where(
          and(
            eq(products.inventoryId, inventoryId),
            eq(products.isArchived, false),
          ),
        )
        .orderBy(desc(products.createdAt), desc(products.id));

      return rows.map(mapProductRowToDomain);
    },
    async save(product) {
      executor.insert(products).values(mapProductToRow(product)).run();
    },
  };
}

export function createSqliteInventoryStateRepository(
  executor: SqliteRepositoryExecutor,
): InventoryStateRepository {
  return {
    async listByInventory(inventoryId) {
      const rows = await executor
        .select()
        .from(inventoryStates)
        .where(eq(inventoryStates.inventoryId, inventoryId))
        .orderBy(asc(inventoryStates.productId));

      return rows.map(mapInventoryStateRowToRecord);
    },
    async save(input) {
      executor
        .insert(inventoryStates)
        .values(mapInventoryStateToRow(input))
        .run();
    },
  };
}

export function createSqliteInventoryMovementRepository(
  executor: SqliteRepositoryExecutor,
): InventoryMovementRepository {
  return {
    async save(movement) {
      executor
        .insert(inventoryMovements)
        .values(mapInventoryMovementToRow(movement))
        .run();
    },
  };
}

export function createSqliteTransactionRepositories(
  executor: SqliteRepositoryExecutor,
): TransactionRepositories {
  return Object.freeze({
    productRepository: createSqliteProductRepository(executor),
    inventoryStateRepository: createSqliteInventoryStateRepository(executor),
    inventoryMovementRepository:
      createSqliteInventoryMovementRepository(executor),
  });
}
