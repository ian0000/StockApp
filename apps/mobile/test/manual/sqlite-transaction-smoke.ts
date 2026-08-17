import { CreateProductUseCase } from '@stock-app/application';
import { Money } from '@stock-app/domain';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { deleteDatabaseAsync, openDatabaseAsync } from 'expo-sqlite';

import { migrateDatabase } from '../../src/infrastructure/sqlite/migrations';
import {
  inventories,
  inventoryMovements,
  inventoryStates,
  products,
} from '../../src/infrastructure/sqlite/schema';
import { createSqliteTransactionManager } from '../../src/infrastructure/sqlite/transaction-manager';

interface SmokeResult {
  readonly successCase: 'passed';
  readonly rollbackCase: 'passed';
}

function requireRowCount(
  rows: readonly unknown[],
  expected: number,
  label: string,
): void {
  if (rows.length !== expected) {
    throw new Error(
      `${label}: expected ${expected} row(s), received ${rows.length}.`,
    );
  }
}

/**
 * Manual native-runtime verification for Expo Go or a development build.
 * Import and invoke it from a temporary native-only development entry.
 * It uses and removes a dedicated disposable database without touching app data.
 */
export async function runSqliteTransactionSmokeTest(): Promise<SmokeResult> {
  const databaseName = `stockapp-infra-002-${Date.now()}.db`;
  const sqlite = await openDatabaseAsync(databaseName);

  try {
    await sqlite.execAsync(
      'PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;',
    );

    const db = drizzle(sqlite, {
      schema: { inventories, inventoryMovements, inventoryStates, products },
    });
    await migrateDatabase({ db });

    db.insert(inventories)
      .values([
        {
          id: 'smoke-success-inventory',
          name: 'Success inventory',
          currency: 'USD',
          createdAt: 1_776_444_000_000,
          updatedAt: 1_776_444_000_000,
        },
        {
          id: 'smoke-rollback-inventory',
          name: 'Rollback inventory',
          currency: 'USD',
          createdAt: 1_776_444_000_000,
          updatedAt: 1_776_444_000_000,
        },
      ])
      .run();

    const transactionManager = createSqliteTransactionManager({ sqlite });
    const successUseCase = new CreateProductUseCase({
      productIdGenerator: { generate: () => 'smoke-success-product' },
      inventoryMovementIdGenerator: {
        generate: () => 'smoke-shared-movement',
      },
      clock: { now: () => 1_776_444_000_000 },
      transactionManager,
    });

    await successUseCase.execute({
      inventoryId: 'smoke-success-inventory',
      name: 'Successful product',
      regularSalePrice: Money.fromDecimal('2.5'),
      initialStock: 3,
      initialUnitCost: Money.fromDecimal('1.25'),
    });

    requireRowCount(
      db
        .select()
        .from(products)
        .where(eq(products.id, 'smoke-success-product'))
        .all(),
      1,
      'Success Product',
    );
    requireRowCount(
      db
        .select()
        .from(inventoryStates)
        .where(eq(inventoryStates.productId, 'smoke-success-product'))
        .all(),
      1,
      'Success InventoryState',
    );
    requireRowCount(
      db
        .select()
        .from(inventoryMovements)
        .where(eq(inventoryMovements.id, 'smoke-shared-movement'))
        .all(),
      1,
      'Success InventoryMovement',
    );

    const rollbackUseCase = new CreateProductUseCase({
      productIdGenerator: { generate: () => 'smoke-rollback-product' },
      inventoryMovementIdGenerator: {
        generate: () => 'smoke-shared-movement',
      },
      clock: { now: () => 1_776_444_001_000 },
      transactionManager,
    });
    let rollbackError: unknown;

    try {
      await rollbackUseCase.execute({
        inventoryId: 'smoke-rollback-inventory',
        name: 'Rolled-back product',
        regularSalePrice: Money.fromDecimal('3'),
        initialStock: 2,
        initialUnitCost: Money.fromDecimal('1.5'),
      });
    } catch (error) {
      rollbackError = error;
    }

    if (rollbackError === undefined) {
      throw new Error(
        'Rollback case did not produce the controlled duplicate-ID error.',
      );
    }

    requireRowCount(
      db
        .select()
        .from(products)
        .where(eq(products.id, 'smoke-rollback-product'))
        .all(),
      0,
      'Rolled-back Product',
    );
    requireRowCount(
      db
        .select()
        .from(inventoryStates)
        .where(
          and(
            eq(inventoryStates.inventoryId, 'smoke-rollback-inventory'),
            eq(inventoryStates.productId, 'smoke-rollback-product'),
          ),
        )
        .all(),
      0,
      'Rolled-back InventoryState',
    );
    requireRowCount(
      db
        .select()
        .from(inventoryMovements)
        .where(eq(inventoryMovements.productId, 'smoke-rollback-product'))
        .all(),
      0,
      'Rolled-back InventoryMovement',
    );

    return Object.freeze({
      successCase: 'passed',
      rollbackCase: 'passed',
    });
  } finally {
    await sqlite.closeAsync();
    await deleteDatabaseAsync(databaseName);
  }
}
