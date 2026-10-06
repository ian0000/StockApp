import type { FromSchema } from 'json-schema-to-ts';
import {
  arrayOf,
  booleanSchema,
  nullable,
  objectSchema,
  optionalTextSchema,
  textSchema,
} from './schema.js';
import {
  nonnegativeStockSchema,
  quantitySchema,
  stockSchema,
  timestampSchema,
} from './transport.js';
import {
  adjustmentCostModeSchema,
  adjustmentReasonSchema,
  entityTimes,
  movementSchema,
  operationStatusSchema,
  operationTimes,
} from './entities.js';

// Backup V1 predates cloud DTOs: IDs remain local strings and scaled units remain safe numbers.
// Application's existing backup parser owns integrity and financial validation.
const units = stockSchema;
const scope = { id: textSchema, inventoryId: textSchema } as const;
const productScope = { ...scope, productId: textSchema } as const;
export const backupInventorySchema = objectSchema({
  id: textSchema,
  name: textSchema,
  currency: textSchema,
  ...entityTimes,
});
export const backupProductSchema = objectSchema({
  ...scope,
  name: textSchema,
  variant: optionalTextSchema,
  barcode: optionalTextSchema,
  regularSalePriceUnits: units,
  minimumStock: nullable(nonnegativeStockSchema),
  isArchived: booleanSchema,
  ...entityTimes,
});
export const backupStateSchema = objectSchema({
  inventoryId: textSchema,
  productId: textSchema,
  stock: stockSchema,
  unitCostUnits: nullable(units),
});
export const backupMovementSchema = objectSchema({
  ...productScope,
  type: movementSchema.properties.type,
  quantityDelta: stockSchema,
  unitCostSnapshotUnits: nullable(units),
  stockBefore: stockSchema,
  stockAfter: stockSchema,
  sourceType: optionalTextSchema,
  sourceId: optionalTextSchema,
  metadata: optionalTextSchema,
  ...operationTimes,
});
export const backupSaleSchema = objectSchema({
  ...scope,
  totalAmountUnits: units,
  estimatedCostUnits: nullable(units),
  estimatedProfitUnits: nullable(units),
  status: operationStatusSchema,
  notes: optionalTextSchema,
  ...operationTimes,
});
export const backupSaleItemSchema = objectSchema({
  id: textSchema,
  saleId: textSchema,
  productId: textSchema,
  quantity: quantitySchema,
  unitSalePriceUnits: units,
  subtotalUnits: units,
  unitCostSnapshotUnits: nullable(units),
  estimatedCostUnits: nullable(units),
  estimatedProfitUnits: nullable(units),
  costStatus: { type: 'string', enum: ['KNOWN', 'UNKNOWN'] },
  ...entityTimes,
});
export const backupPurchaseSchema = objectSchema({
  ...productScope,
  quantity: quantitySchema,
  unitCostUnits: units,
  totalAmountUnits: units,
  status: operationStatusSchema,
  notes: optionalTextSchema,
  averageCostBeforeUnits: nullable(units),
  averageCostAfterUnits: units,
  stockBefore: stockSchema,
  stockAfter: stockSchema,
  ...operationTimes,
});
export const backupAdjustmentSchema = objectSchema({
  ...productScope,
  stockBefore: stockSchema,
  actualStock: nonnegativeStockSchema,
  difference: stockSchema,
  reason: adjustmentReasonSchema,
  costMode: nullable(adjustmentCostModeSchema),
  unitCostUnits: units,
  ...operationTimes,
});
export const backupSchema = objectSchema({
  format: { type: 'string', const: 'stockapp-backup' },
  formatVersion: { type: 'integer', const: 1 },
  createdAt: timestampSchema,
  inventoryId: textSchema,
  data: objectSchema({
    inventories: arrayOf(backupInventorySchema),
    products: arrayOf(backupProductSchema),
    inventoryStates: arrayOf(backupStateSchema),
    inventoryMovements: arrayOf(backupMovementSchema),
    sales: arrayOf(backupSaleSchema),
    saleItems: arrayOf(backupSaleItemSchema),
    purchases: arrayOf(backupPurchaseSchema),
    stockAdjustments: arrayOf(backupAdjustmentSchema),
  }),
});
export type BackupV1Transport = FromSchema<typeof backupSchema>;
