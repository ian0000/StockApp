import type {
  InventoryRepository,
  InventoryMovementRepository,
  InventoryStateRepository,
  ProductRepository,
  TransactionRepositories,
} from '@stock-app/application';

import type { AppDatabase } from '../database';
import {
  inventories,
  inventoryMovements,
  inventoryStates,
  products,
} from '../schema';
import {
  mapInventoryToRow,
  mapInventoryMovementToRow,
  mapInventoryStateToRow,
  mapProductToRow,
} from './mappers';

type SqliteInsertExecutor = Pick<AppDatabase['db'], 'insert'>;

export function createInventoryRepository(
  executor: SqliteInsertExecutor,
): InventoryRepository {
  return {
    async save(inventory) {
      executor.insert(inventories).values(mapInventoryToRow(inventory)).run();
    },
  };
}

export function createSqliteProductRepository(
  executor: SqliteInsertExecutor,
): ProductRepository {
  return {
    async save(product) {
      executor.insert(products).values(mapProductToRow(product)).run();
    },
  };
}

export function createSqliteInventoryStateRepository(
  executor: SqliteInsertExecutor,
): InventoryStateRepository {
  return {
    async save(input) {
      executor
        .insert(inventoryStates)
        .values(mapInventoryStateToRow(input))
        .run();
    },
  };
}

export function createSqliteInventoryMovementRepository(
  executor: SqliteInsertExecutor,
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
  executor: SqliteInsertExecutor,
): TransactionRepositories {
  return Object.freeze({
    productRepository: createSqliteProductRepository(executor),
    inventoryStateRepository: createSqliteInventoryStateRepository(executor),
    inventoryMovementRepository:
      createSqliteInventoryMovementRepository(executor),
  });
}
