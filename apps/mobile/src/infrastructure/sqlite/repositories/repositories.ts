import type {
  InventoryRepository,
  InventoryMovementRepository,
  InventoryStateRepository,
  ProductRepository,
  SaleItemRepository,
  SaleRepository,
  TransactionRepositories,
} from '@stock-app/application';
import { and, asc, desc, eq } from 'drizzle-orm';

import type { AppDatabase } from '../database';
import {
  inventories,
  inventoryMovements,
  inventoryStates,
  products,
  saleItems,
  sales,
} from '../schema';
import {
  mapInventoryToRow,
  mapInventoryRowToDomain,
  mapInventoryMovementToRow,
  mapInventoryStateRowToRecord,
  mapInventoryStateToRow,
  mapProductRowToDomain,
  mapProductToRow,
  mapSaleItemToRow,
  mapSaleToRow,
} from './mappers';

type SqliteRepositoryExecutor = Pick<AppDatabase['db'], 'insert' | 'select'>;
type SqliteInventoryStateExecutor = Pick<
  AppDatabase['db'],
  'insert' | 'select' | 'update'
>;

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
  executor: SqliteInventoryStateExecutor,
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
    async update(input) {
      const result = executor
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

export function createSqliteSaleRepository(
  executor: Pick<AppDatabase['db'], 'insert'>,
): SaleRepository {
  return {
    async save(sale) {
      executor.insert(sales).values(mapSaleToRow(sale)).run();
    },
  };
}

export function createSqliteSaleItemRepository(
  executor: Pick<AppDatabase['db'], 'insert'>,
): SaleItemRepository {
  return {
    async save(item) {
      executor.insert(saleItems).values(mapSaleItemToRow(item)).run();
    },
  };
}

export function createSqliteTransactionRepositories(
  executor: SqliteInventoryStateExecutor,
): TransactionRepositories {
  return Object.freeze({
    productRepository: createSqliteProductRepository(executor),
    inventoryStateRepository: createSqliteInventoryStateRepository(executor),
    inventoryMovementRepository:
      createSqliteInventoryMovementRepository(executor),
    saleRepository: createSqliteSaleRepository(executor),
    saleItemRepository: createSqliteSaleItemRepository(executor),
  });
}
