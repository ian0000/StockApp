import type {
  BackupDataV1,
  BackupRestoreTransaction,
} from '@stock-app/application';

import type { AppDatabase } from './database';
import {
  inventories,
  inventoryMovements,
  inventoryStates,
  products,
  purchases,
  saleItems,
  sales,
  stockAdjustments,
} from './schema';

export type BackupRestoreExecutor = Pick<
  AppDatabase['db'],
  'delete' | 'insert'
>;

export type BackupRestorePhase =
  | 'after-delete'
  | 'after-inventories'
  | 'after-products'
  | 'after-inventory-states'
  | 'after-sales'
  | 'after-sale-items'
  | 'after-purchases'
  | 'after-stock-adjustments'
  | 'after-inventory-movements';

export type BackupRestoreTransactionRunner = (
  operation: (executor: BackupRestoreExecutor) => Promise<void>,
) => Promise<void>;

export function createBackupRestoreTransaction(
  runTransaction: BackupRestoreTransactionRunner,
  afterPhase: (phase: BackupRestorePhase) => void = () => undefined,
): BackupRestoreTransaction {
  return {
    async replace(data) {
      await runTransaction((executor) =>
        replaceBackupData(executor, data, afterPhase),
      );
    },
  };
}

async function replaceBackupData(
  executor: BackupRestoreExecutor,
  data: BackupDataV1,
  afterPhase: (phase: BackupRestorePhase) => void,
): Promise<void> {
  await executor.delete(saleItems);
  await executor.delete(inventoryMovements);
  await executor.delete(purchases);
  await executor.delete(stockAdjustments);
  await executor.delete(sales);
  await executor.delete(inventoryStates);
  await executor.delete(products);
  await executor.delete(inventories);
  afterPhase('after-delete');

  if (data.inventories.length > 0) {
    await executor.insert(inventories).values([...data.inventories]);
  }
  afterPhase('after-inventories');
  if (data.products.length > 0) {
    await executor.insert(products).values([...data.products]);
  }
  afterPhase('after-products');
  if (data.inventoryStates.length > 0) {
    await executor.insert(inventoryStates).values([...data.inventoryStates]);
  }
  afterPhase('after-inventory-states');
  if (data.sales.length > 0) {
    await executor.insert(sales).values([...data.sales]);
  }
  afterPhase('after-sales');
  if (data.saleItems.length > 0) {
    await executor.insert(saleItems).values([...data.saleItems]);
  }
  afterPhase('after-sale-items');
  if (data.purchases.length > 0) {
    await executor.insert(purchases).values([...data.purchases]);
  }
  afterPhase('after-purchases');
  if (data.stockAdjustments.length > 0) {
    await executor.insert(stockAdjustments).values([...data.stockAdjustments]);
  }
  afterPhase('after-stock-adjustments');
  if (data.inventoryMovements.length > 0) {
    await executor
      .insert(inventoryMovements)
      .values([...data.inventoryMovements]);
  }
  afterPhase('after-inventory-movements');
}
