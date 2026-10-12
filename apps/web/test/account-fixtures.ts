import type { AccountExport, BackupV1Transport } from '@stock-app/contracts';
import { me } from './session-fixtures.js';
export const inventoryId = me.inventory!.id;
const times = { createdAt: 1000, updatedAt: 1001 };
const operationTimes = { ...times, effectiveAt: 999 };
export function backup(): BackupV1Transport {
  return {
    format: 'stockapp-backup',
    formatVersion: 1,
    createdAt: 2000,
    inventoryId,
    data: {
      inventories: [
        { id: inventoryId, name: 'Inventario A', currency: 'EUR', ...times },
      ],
      products: [
        {
          id: 'legacy-product',
          inventoryId,
          name: 'Producto histórico',
          variant: null,
          barcode: '00001',
          regularSalePriceUnits: 1000001,
          minimumStock: 0,
          isArchived: true,
          ...times,
        },
      ],
      inventoryStates: [
        {
          inventoryId,
          productId: 'legacy-product',
          stock: -2,
          unitCostUnits: null,
        },
      ],
      inventoryMovements: [
        {
          id: 'reversal',
          inventoryId,
          productId: 'legacy-product',
          type: 'REVERSAL',
          quantityDelta: 1,
          unitCostSnapshotUnits: 0,
          stockBefore: -3,
          stockAfter: -2,
          sourceType: 'SALE',
          sourceId: 'original',
          metadata: null,
          ...operationTimes,
        },
      ],
      sales: [
        {
          id: 'sale',
          inventoryId,
          totalAmountUnits: 1000001,
          estimatedCostUnits: null,
          estimatedProfitUnits: null,
          status: 'VOIDED',
          notes: null,
          ...operationTimes,
        },
      ],
      saleItems: [
        {
          id: 'item',
          saleId: 'sale',
          productId: 'legacy-product',
          quantity: 1,
          unitSalePriceUnits: 1000001,
          subtotalUnits: 1000001,
          unitCostSnapshotUnits: null,
          estimatedCostUnits: null,
          estimatedProfitUnits: null,
          costStatus: 'UNKNOWN',
          ...times,
        },
      ],
      purchases: [
        {
          id: 'purchase',
          inventoryId,
          productId: 'legacy-product',
          quantity: 1,
          unitCostUnits: 0,
          totalAmountUnits: 0,
          status: 'VOIDED',
          notes: null,
          averageCostBeforeUnits: null,
          averageCostAfterUnits: 0,
          stockBefore: -2,
          stockAfter: -1,
          ...operationTimes,
        },
      ],
      stockAdjustments: [
        {
          id: 'adjustment',
          inventoryId,
          productId: 'legacy-product',
          stockBefore: 2,
          actualStock: 1,
          difference: -1,
          reason: 'DAMAGED',
          costMode: null,
          unitCostUnits: 0,
          ...operationTimes,
        },
      ],
    },
  };
}
export function accountExport(withBackup = true): AccountExport {
  return {
    user: structuredClone(me.user),
    backup: withBackup ? backup() : null,
    exportedAt: 3000,
  };
}
export const acceptedDeletion = {
  status: 'DELETION_REQUESTED',
  requestedAt: 3000,
  sessionsRevoked: true,
} as const;
