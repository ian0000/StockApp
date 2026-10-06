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
  moneySchema,
  nonnegativeMoneySchema,
  positiveMoneySchema,
  percentageSchema,
  nonnegativeStockSchema,
  quantitySchema,
  revisionSchema,
  stockSchema,
  timestampSchema,
  uuidSchema,
} from './transport.js';

export const entityTimes = {
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
} as const;
export const operationTimes = {
  effectiveAt: timestampSchema,
  ...entityTimes,
} as const;
export const operationStatusSchema = {
  type: 'string',
  enum: ['CONFIRMED', 'VOIDED'],
} as const;
export const adjustmentReasonSchema = {
  type: 'string',
  enum: ['COUNT_CORRECTION', 'DAMAGED', 'LOST', 'INTERNAL_USE', 'OTHER'],
} as const;
export const adjustmentCostModeSchema = {
  type: 'string',
  enum: ['USE_CURRENT_COST', 'CUSTOM_COST'],
} as const;
export const productSchema = objectSchema({
  id: uuidSchema,
  inventoryId: uuidSchema,
  name: textSchema,
  variant: optionalTextSchema,
  barcode: optionalTextSchema,
  regularSalePrice: nonnegativeMoneySchema,
  minimumStock: nullable(nonnegativeStockSchema),
  isArchived: booleanSchema,
  metadataRevision: revisionSchema,
  ...entityTimes,
});
export const inventoryStateSchema = objectSchema({
  inventoryId: uuidSchema,
  productId: uuidSchema,
  stock: stockSchema,
  unitCost: nullable(nonnegativeMoneySchema),
  stateRevision: revisionSchema,
  lastMovementId: nullable(uuidSchema),
});
export const productReadSchema = objectSchema({
  product: productSchema,
  state: inventoryStateSchema,
  isLowStock: booleanSchema,
  margin: nullable(percentageSchema),
  markup: nullable(percentageSchema),
});
export const saleSchema = objectSchema({
  id: uuidSchema,
  inventoryId: uuidSchema,
  status: operationStatusSchema,
  totalAmount: nonnegativeMoneySchema,
  estimatedCost: nullable(nonnegativeMoneySchema),
  estimatedProfit: nullable(moneySchema),
  notes: optionalTextSchema,
  ...operationTimes,
});
const saleItemFields = {
  id: uuidSchema,
  inventoryId: uuidSchema,
  saleId: uuidSchema,
  productId: uuidSchema,
  quantity: quantitySchema,
  unitSalePrice: positiveMoneySchema,
  subtotal: nonnegativeMoneySchema,
  ...entityTimes,
} as const;
export const saleItemSchema = {
  oneOf: [
    objectSchema({
      ...saleItemFields,
      costStatus: { type: 'string', const: 'KNOWN' },
      unitCostSnapshot: nonnegativeMoneySchema,
      estimatedCost: nonnegativeMoneySchema,
      estimatedProfit: moneySchema,
    }),
    objectSchema({
      ...saleItemFields,
      costStatus: { type: 'string', const: 'UNKNOWN' },
      unitCostSnapshot: { type: 'null' },
      estimatedCost: { type: 'null' },
      estimatedProfit: { type: 'null' },
    }),
  ],
} as const;
export const purchaseSchema = objectSchema({
  id: uuidSchema,
  inventoryId: uuidSchema,
  productId: uuidSchema,
  quantity: quantitySchema,
  unitCost: nonnegativeMoneySchema,
  totalAmount: nonnegativeMoneySchema,
  stockBefore: stockSchema,
  stockAfter: stockSchema,
  averageCostBefore: nullable(nonnegativeMoneySchema),
  averageCostAfter: nonnegativeMoneySchema,
  status: operationStatusSchema,
  notes: optionalTextSchema,
  ...operationTimes,
});
export const priceAnalysisSchema = objectSchema({
  previousUnitCost: nullable(nonnegativeMoneySchema),
  currentUnitCost: nonnegativeMoneySchema,
  regularSalePrice: nonnegativeMoneySchema,
  previousMargin: nullable(percentageSchema),
  currentMargin: nullable(percentageSchema),
  suggestedSalePrice: nullable(nonnegativeMoneySchema),
  costChanged: booleanSchema,
});
export const adjustmentSchema = objectSchema({
  id: uuidSchema,
  inventoryId: uuidSchema,
  productId: uuidSchema,
  stockBefore: stockSchema,
  actualStock: nonnegativeStockSchema,
  difference: stockSchema,
  reason: adjustmentReasonSchema,
  costMode: nullable(adjustmentCostModeSchema),
  unitCost: nonnegativeMoneySchema,
  ...operationTimes,
});
export const movementSchema = objectSchema({
  id: uuidSchema,
  inventoryId: uuidSchema,
  productId: uuidSchema,
  type: {
    type: 'string',
    enum: [
      'INITIAL_STOCK',
      'PURCHASE',
      'SALE',
      'ADJUSTMENT_IN',
      'ADJUSTMENT_OUT',
      'REVERSAL',
    ],
  },
  quantityDelta: stockSchema,
  stockBefore: stockSchema,
  stockAfter: stockSchema,
  unitCostSnapshot: nullable(nonnegativeMoneySchema),
  sourceType: optionalTextSchema,
  sourceId: nullable(uuidSchema),
  reversalOfMovementId: nullable(uuidSchema),
  metadata: optionalTextSchema,
  ...operationTimes,
});
export const voidEligibilitySchema = objectSchema({
  eligible: booleanSchema,
  reason: nullable({
    type: 'string',
    enum: ['SUBSEQUENT_OR_AMBIGUOUS_MOVEMENT', 'CURRENT_STATE_MISMATCH'],
  }),
});
export const saleDetailSchema = objectSchema({
  sale: saleSchema,
  items: arrayOf(saleItemSchema),
  voidEligibility: voidEligibilitySchema,
});
export const purchaseDetailSchema = objectSchema({
  purchase: purchaseSchema,
  voidEligibility: voidEligibilitySchema,
});
export const resultMetadataSchema = {
  committedRevision: revisionSchema,
  serverRecordedAt: timestampSchema,
} as const;
export const createProductResultSchema = objectSchema({
  product: productSchema,
  state: inventoryStateSchema,
  initialMovement: nullable(movementSchema),
  ...resultMetadataSchema,
});
export const productMutationResultSchema = objectSchema({
  product: productSchema,
  ...resultMetadataSchema,
});
export const registerSaleResultSchema = objectSchema({
  sale: saleSchema,
  items: arrayOf(saleItemSchema),
  states: arrayOf(inventoryStateSchema),
  movements: arrayOf(movementSchema),
  ...resultMetadataSchema,
});
export const registerPurchaseResultSchema = objectSchema({
  purchase: purchaseSchema,
  product: productSchema,
  beforeState: inventoryStateSchema,
  afterState: inventoryStateSchema,
  priceAnalysis: priceAnalysisSchema,
  movement: movementSchema,
  ...resultMetadataSchema,
});
export const adjustStockResultSchema = objectSchema({
  adjustment: adjustmentSchema,
  state: inventoryStateSchema,
  movement: movementSchema,
  ...resultMetadataSchema,
});
export const voidSaleResultSchema = objectSchema({
  kind: { type: 'string', enum: ['VOIDED', 'ALREADY_VOIDED'] },
  sale: saleSchema,
  reversals: arrayOf(movementSchema),
  states: arrayOf(inventoryStateSchema),
  ...resultMetadataSchema,
});
export const voidPurchaseResultSchema = objectSchema({
  kind: { type: 'string', enum: ['VOIDED', 'ALREADY_VOIDED'] },
  purchase: purchaseSchema,
  reversals: arrayOf(movementSchema),
  states: arrayOf(inventoryStateSchema),
  ...resultMetadataSchema,
});
export type ProductDto = FromSchema<typeof productSchema>;
export type InventoryStateDto = FromSchema<typeof inventoryStateSchema>;
export type SaleDto = FromSchema<typeof saleSchema>;
export type SaleItemDto = FromSchema<typeof saleItemSchema>;
export type PurchaseDto = FromSchema<typeof purchaseSchema>;
export type AdjustmentDto = FromSchema<typeof adjustmentSchema>;
export type InventoryMovementDto = FromSchema<typeof movementSchema>;
export type ProductReadDto = FromSchema<typeof productReadSchema>;
export type SaleDetailDto = FromSchema<typeof saleDetailSchema>;
export type PurchaseDetailDto = FromSchema<typeof purchaseDetailSchema>;
export type PriceAnalysisDto = FromSchema<typeof priceAnalysisSchema>;
export type CreateProductCommandResult = FromSchema<
  typeof createProductResultSchema
>;
export type ProductMutationResult = FromSchema<
  typeof productMutationResultSchema
>;
export type RegisterSaleCommandResult = FromSchema<
  typeof registerSaleResultSchema
>;
export type RegisterPurchaseCommandResult = FromSchema<
  typeof registerPurchaseResultSchema
>;
export type AdjustStockCommandResult = FromSchema<
  typeof adjustStockResultSchema
>;
export type VoidSaleCommandResult = FromSchema<typeof voidSaleResultSchema>;
export type VoidPurchaseCommandResult = FromSchema<
  typeof voidPurchaseResultSchema
>;
