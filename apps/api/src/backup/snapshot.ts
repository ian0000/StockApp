import { and, eq } from 'drizzle-orm';
import type {
  BackupSnapshotReader,
  BackupDataV1,
} from '@stock-app/application';
import type { OwnershipDatabase } from '../ownership/context.js';
import { OwnershipError } from '../ownership/errors.js';
import {
  businesses,
  inventories,
  products,
  inventoryStates,
  inventoryMovements,
  sales,
  saleItems,
  purchases,
  stockAdjustments,
} from '../infrastructure/postgres/schema.js';

export function backupNumber(value: bigint): number {
  if (value < -9007199254740991n || value > 9007199254740991n)
    throw new RangeError('Backup integer exceeds the safe range.');
  return Number(value);
}
function nullableNumber(value: bigint | null): number | null {
  return value === null ? null : backupNumber(value);
}
function member<T extends string>(value: string, allowed: readonly T[]): T {
  for (const candidate of allowed) if (value === candidate) return candidate;
  throw new Error('Invalid backup enum.');
}
const statuses = ['CONFIRMED', 'VOIDED'] as const;
const times = (row: { createdAt: bigint; updatedAt: bigint }) => ({
  createdAt: backupNumber(row.createdAt),
  updatedAt: backupNumber(row.updatedAt),
});

export function createPostgresBackupReader(
  database: Pick<OwnershipDatabase, 'transaction'>,
  userId: string,
  requireCloudAccess: boolean,
): BackupSnapshotReader {
  return {
    async readSnapshot(inventoryId): Promise<BackupDataV1> {
      return database.transaction(
        async (tx) => {
          // This first SELECT acquires the MVCC snapshot and establishes ownership within it.
          const [scope] = await tx
            .select({ business: businesses, inventory: inventories })
            .from(businesses)
            .leftJoin(
              inventories,
              and(
                eq(inventories.businessId, businesses.id),
                eq(inventories.id, inventoryId),
              ),
            )
            .where(eq(businesses.ownerUserId, userId));
          if (!scope)
            throw new OwnershipError(
              404,
              'NOT_FOUND',
              'No encontramos este inventario.',
            );
          if (
            scope.business.status !== 'ACTIVE' ||
            (requireCloudAccess && !scope.business.cloudAccessEnabled)
          )
            throw new OwnershipError(
              403,
              'CLOUD_ACCESS_DISABLED',
              'El acceso cloud no está habilitado.',
            );
          if (!scope.inventory)
            throw new OwnershipError(
              404,
              'NOT_FOUND',
              'No encontramos este inventario.',
            );
          const inventory = scope.inventory;
          // All eight collections share one read-only snapshot. Never filter archived or VOIDED history.
          const productRows = await tx
            .select()
            .from(products)
            .where(eq(products.inventoryId, inventoryId));
          const states = await tx
            .select()
            .from(inventoryStates)
            .where(eq(inventoryStates.inventoryId, inventoryId));
          const movements = await tx
            .select()
            .from(inventoryMovements)
            .where(eq(inventoryMovements.inventoryId, inventoryId));
          const saleRows = await tx
            .select()
            .from(sales)
            .where(eq(sales.inventoryId, inventoryId));
          const items = await tx
            .select()
            .from(saleItems)
            .where(eq(saleItems.inventoryId, inventoryId));
          const purchaseRows = await tx
            .select()
            .from(purchases)
            .where(eq(purchases.inventoryId, inventoryId));
          const adjustments = await tx
            .select()
            .from(stockAdjustments)
            .where(eq(stockAdjustments.inventoryId, inventoryId));
          // Explicit projections keep cloud transport/revision/auth metadata out of BackupV1.
          return {
            inventories: [
              {
                id: inventory.id,
                name: inventory.name,
                currency: inventory.currency,
                ...times(inventory),
              },
            ],
            products: productRows.map((row) => ({
              id: row.id,
              inventoryId: row.inventoryId,
              name: row.name,
              variant: row.variant,
              barcode: row.barcode,
              regularSalePriceUnits: backupNumber(row.regularSalePriceUnits),
              minimumStock: nullableNumber(row.minimumStock),
              isArchived: row.isArchived,
              ...times(row),
            })),
            inventoryStates: states.map((row) => ({
              inventoryId: row.inventoryId,
              productId: row.productId,
              stock: backupNumber(row.stock),
              unitCostUnits: nullableNumber(row.unitCostUnits),
            })),
            inventoryMovements: movements.map((row) => ({
              id: row.id,
              inventoryId: row.inventoryId,
              productId: row.productId,
              type: member(row.type, [
                'INITIAL_STOCK',
                'PURCHASE',
                'SALE',
                'ADJUSTMENT_IN',
                'ADJUSTMENT_OUT',
                'REVERSAL',
              ] as const),
              quantityDelta: backupNumber(row.quantityDelta),
              unitCostSnapshotUnits: nullableNumber(row.unitCostSnapshotUnits),
              stockBefore: backupNumber(row.stockBefore),
              stockAfter: backupNumber(row.stockAfter),
              sourceType: row.sourceType,
              sourceId: row.sourceId,
              metadata: row.metadata,
              effectiveAt: backupNumber(row.effectiveAt),
              ...times(row),
            })),
            sales: saleRows.map((row) => ({
              id: row.id,
              inventoryId: row.inventoryId,
              status: member(row.status, statuses),
              totalAmountUnits: backupNumber(row.totalAmountUnits),
              estimatedCostUnits: nullableNumber(row.estimatedCostUnits),
              estimatedProfitUnits: nullableNumber(row.estimatedProfitUnits),
              notes: row.notes,
              effectiveAt: backupNumber(row.effectiveAt),
              ...times(row),
            })),
            saleItems: items.map((row) => ({
              id: row.id,
              saleId: row.saleId,
              productId: row.productId,
              quantity: backupNumber(row.quantity),
              unitSalePriceUnits: backupNumber(row.unitSalePriceUnits),
              subtotalUnits: backupNumber(row.subtotalUnits),
              unitCostSnapshotUnits: nullableNumber(row.unitCostSnapshotUnits),
              estimatedCostUnits: nullableNumber(row.estimatedCostUnits),
              estimatedProfitUnits: nullableNumber(row.estimatedProfitUnits),
              costStatus: member(row.costStatus, ['KNOWN', 'UNKNOWN'] as const),
              ...times(row),
            })),
            purchases: purchaseRows.map((row) => ({
              id: row.id,
              inventoryId: row.inventoryId,
              productId: row.productId,
              status: member(row.status, statuses),
              quantity: backupNumber(row.quantity),
              unitCostUnits: backupNumber(row.unitCostUnits),
              totalAmountUnits: backupNumber(row.totalAmountUnits),
              notes: row.notes,
              averageCostBeforeUnits: nullableNumber(
                row.averageCostBeforeUnits,
              ),
              averageCostAfterUnits: backupNumber(row.averageCostAfterUnits),
              stockBefore: backupNumber(row.stockBefore),
              stockAfter: backupNumber(row.stockAfter),
              effectiveAt: backupNumber(row.effectiveAt),
              ...times(row),
            })),
            stockAdjustments: adjustments.map((row) => ({
              id: row.id,
              inventoryId: row.inventoryId,
              productId: row.productId,
              stockBefore: backupNumber(row.stockBefore),
              actualStock: backupNumber(row.actualStock),
              difference: backupNumber(row.difference),
              reason: member(row.reason, [
                'COUNT_CORRECTION',
                'DAMAGED',
                'LOST',
                'INTERNAL_USE',
                'OTHER',
              ] as const),
              costMode:
                row.costMode === null
                  ? null
                  : member(row.costMode, [
                      'USE_CURRENT_COST',
                      'CUSTOM_COST',
                    ] as const),
              unitCostUnits: backupNumber(row.unitCostUnits),
              effectiveAt: backupNumber(row.effectiveAt),
              ...times(row),
            })),
          };
        },
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      );
    },
  };
}
