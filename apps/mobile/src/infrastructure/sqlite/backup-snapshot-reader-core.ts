import type {
  BackupDataV1,
  BackupSnapshotReader,
} from '@stock-app/application';
import { and, asc, eq } from 'drizzle-orm';
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

export type BackupReadExecutor = Pick<AppDatabase['db'], 'select'>;
export type BackupReadTransaction = (
  operation: (executor: BackupReadExecutor) => Promise<BackupDataV1>,
) => Promise<BackupDataV1>;

export function createBackupSnapshotReader(
  runReadTransaction: BackupReadTransaction,
): BackupSnapshotReader {
  return {
    async readSnapshot(inventoryId) {
      return runReadTransaction((executor) =>
        readBackupSnapshot(executor, inventoryId),
      );
    },
  };
}

async function readBackupSnapshot(
  executor: BackupReadExecutor,
  inventoryId: string,
): Promise<BackupDataV1> {
  const inventoryRows = await executor
    .select()
    .from(inventories)
    .where(eq(inventories.id, inventoryId))
    .orderBy(asc(inventories.id));
  const productRows = await executor
    .select()
    .from(products)
    .where(eq(products.inventoryId, inventoryId))
    .orderBy(asc(products.createdAt), asc(products.id));
  const stateRows = await executor
    .select()
    .from(inventoryStates)
    .where(eq(inventoryStates.inventoryId, inventoryId))
    .orderBy(asc(inventoryStates.productId));
  const movementRows = await executor
    .select()
    .from(inventoryMovements)
    .where(eq(inventoryMovements.inventoryId, inventoryId))
    .orderBy(asc(inventoryMovements.createdAt), asc(inventoryMovements.id));
  const saleRows = await executor
    .select()
    .from(sales)
    .where(eq(sales.inventoryId, inventoryId))
    .orderBy(asc(sales.createdAt), asc(sales.id));
  const saleItemRows = await executor
    .select({
      id: saleItems.id,
      saleId: saleItems.saleId,
      productId: saleItems.productId,
      quantity: saleItems.quantity,
      unitSalePriceUnits: saleItems.unitSalePriceUnits,
      subtotalUnits: saleItems.subtotalUnits,
      unitCostSnapshotUnits: saleItems.unitCostSnapshotUnits,
      estimatedCostUnits: saleItems.estimatedCostUnits,
      estimatedProfitUnits: saleItems.estimatedProfitUnits,
      costStatus: saleItems.costStatus,
      createdAt: saleItems.createdAt,
      updatedAt: saleItems.updatedAt,
    })
    .from(saleItems)
    .innerJoin(
      sales,
      and(eq(saleItems.saleId, sales.id), eq(sales.inventoryId, inventoryId)),
    )
    .orderBy(asc(saleItems.createdAt), asc(saleItems.id));
  const purchaseRows = await executor
    .select()
    .from(purchases)
    .where(eq(purchases.inventoryId, inventoryId))
    .orderBy(asc(purchases.createdAt), asc(purchases.id));
  const adjustmentRows = await executor
    .select()
    .from(stockAdjustments)
    .where(eq(stockAdjustments.inventoryId, inventoryId))
    .orderBy(asc(stockAdjustments.createdAt), asc(stockAdjustments.id));

  return {
    inventories: inventoryRows,
    products: productRows,
    inventoryStates: stateRows,
    inventoryMovements: movementRows,
    sales: saleRows,
    saleItems: saleItemRows,
    purchases: purchaseRows,
    stockAdjustments: adjustmentRows,
  };
}
