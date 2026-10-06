import type { FromSchema } from 'json-schema-to-ts';
import {
  arrayOf,
  emptyObjectSchema,
  nullable,
  objectSchema,
  optionalTextSchema,
  textSchema,
} from './schema.js';
import {
  adjustmentCostModeSchema,
  adjustmentReasonSchema,
} from './entities.js';
import {
  domainVersionSchema,
  moneySchema,
  nonnegativeMoneySchema,
  positiveMoneySchema,
  nonnegativeStockSchema,
  protocolVersionSchema,
  quantitySchema,
  revisionSchema,
  stockSchema,
  timestampSchema,
  uuidSchema,
  uuidV7Schema,
} from './transport.js';

export const COMMAND_KINDS = [
  'PRODUCT_CREATE',
  'PRODUCT_UPDATE',
  'PRODUCT_ARCHIVE',
  'SALE_REGISTER',
  'PURCHASE_REGISTER',
  'STOCK_ADJUST',
  'SALE_VOID',
  'PURCHASE_VOID',
] as const;
export const revisionExpectationSchema = {
  oneOf: [revisionSchema, objectSchema({ operationId: uuidV7Schema })],
} as const;
export const stateEvidenceSchema = objectSchema({
  stock: stockSchema,
  unitCost: nullable(nonnegativeMoneySchema),
  lastMovementId: nullable(uuidSchema),
});
export const statePreconditionsSchema = objectSchema({
  expectedStateRevision: revisionExpectationSchema,
  expectedState: stateEvidenceSchema,
});
export const saleCostEvidenceSchema = objectSchema({
  productId: uuidSchema,
  unitCostSnapshot: nullable(nonnegativeMoneySchema),
  estimatedCost: nullable(nonnegativeMoneySchema),
  estimatedProfit: nullable(moneySchema),
});
export const salePreconditionsSchema = objectSchema({
  expectedCosts: { ...arrayOf(saleCostEvidenceSchema), minItems: 1 },
});
export const voidStateEvidenceSchema = objectSchema({
  productId: uuidSchema,
  expectedStateRevision: revisionExpectationSchema,
  expectedState: stateEvidenceSchema,
});
export const voidPreconditionsSchema = objectSchema({
  states: { ...arrayOf(voidStateEvidenceSchema), minItems: 1 },
});
const metadataFields = {
  name: textSchema,
  variant: optionalTextSchema,
  barcode: optionalTextSchema,
  regularSalePrice: nonnegativeMoneySchema,
  minimumStock: nullable(nonnegativeStockSchema),
} as const;
export const createProductPayloadSchema = objectSchema({
  productId: uuidV7Schema,
  initialMovementId: nullable(uuidV7Schema),
  createdAt: timestampSchema,
  ...metadataFields,
  initialStock: nonnegativeStockSchema,
  initialUnitCost: nullable(nonnegativeMoneySchema),
});
export const updateProductPayloadSchema = objectSchema({
  productId: uuidSchema,
  ...metadataFields,
});
export const archiveProductPayloadSchema = objectSchema({
  productId: uuidSchema,
});
export const metadataPreconditionsSchema = objectSchema({
  expectedMetadataRevision: revisionSchema,
});
export const saleLineSchema = objectSchema({
  productId: uuidSchema,
  saleItemId: uuidV7Schema,
  movementId: uuidV7Schema,
  quantity: quantitySchema,
  unitSalePrice: positiveMoneySchema,
});
export const registerSalePayloadSchema = objectSchema({
  saleId: uuidV7Schema,
  createdAt: timestampSchema,
  items: { ...arrayOf(saleLineSchema), minItems: 1 },
  notes: optionalTextSchema,
});
export const registerPurchasePayloadSchema = objectSchema({
  purchaseId: uuidV7Schema,
  movementId: uuidV7Schema,
  createdAt: timestampSchema,
  productId: uuidSchema,
  quantity: quantitySchema,
  unitCost: nonnegativeMoneySchema,
  notes: optionalTextSchema,
});
export const adjustStockPayloadSchema = objectSchema({
  stockAdjustmentId: uuidV7Schema,
  movementId: uuidV7Schema,
  createdAt: timestampSchema,
  productId: uuidSchema,
  actualStock: nonnegativeStockSchema,
  reason: adjustmentReasonSchema,
  costMode: nullable(adjustmentCostModeSchema),
  customUnitCost: nullable(nonnegativeMoneySchema),
});
export const reversalIdentitySchema = objectSchema({
  productId: uuidSchema,
  movementId: uuidV7Schema,
});
export const voidSalePayloadSchema = objectSchema({
  saleId: uuidSchema,
  createdAt: timestampSchema,
  reversalMovements: { ...arrayOf(reversalIdentitySchema), minItems: 1 },
});
export const voidPurchasePayloadSchema = objectSchema({
  purchaseId: uuidSchema,
  createdAt: timestampSchema,
  reversalMovementId: uuidV7Schema,
});

function envelope<
  const K extends (typeof COMMAND_KINDS)[number],
  const P extends
    | typeof createProductPayloadSchema
    | typeof updateProductPayloadSchema
    | typeof archiveProductPayloadSchema
    | typeof registerSalePayloadSchema
    | typeof registerPurchasePayloadSchema
    | typeof adjustStockPayloadSchema
    | typeof voidSalePayloadSchema
    | typeof voidPurchasePayloadSchema,
  const C extends
    | typeof emptyObjectSchema
    | typeof metadataPreconditionsSchema
    | typeof salePreconditionsSchema
    | typeof statePreconditionsSchema
    | typeof voidPreconditionsSchema,
>(commandKind: K, payload: P, preconditions: C) {
  return {
    type: 'object',
    properties: {
      protocolVersion: protocolVersionSchema,
      domainVersion: domainVersionSchema,
      commandKind: { type: 'string', const: commandKind },
      operationId: uuidV7Schema,
      occurredAt: timestampSchema,
      deviceId: nullable(uuidV7Schema),
      dependsOn: { ...arrayOf(uuidV7Schema), uniqueItems: true },
      supersedesOperationId: uuidV7Schema,
      payload,
      preconditions,
    },
    required: [
      'protocolVersion',
      'domainVersion',
      'commandKind',
      'operationId',
      'occurredAt',
      'dependsOn',
      'payload',
      'preconditions',
    ],
    additionalProperties: false,
  } as const;
}
export const commandEnvelopeSchema = {
  oneOf: [
    envelope('PRODUCT_CREATE', createProductPayloadSchema, emptyObjectSchema),
    envelope(
      'PRODUCT_UPDATE',
      updateProductPayloadSchema,
      metadataPreconditionsSchema,
    ),
    envelope(
      'PRODUCT_ARCHIVE',
      archiveProductPayloadSchema,
      metadataPreconditionsSchema,
    ),
    envelope(
      'SALE_REGISTER',
      registerSalePayloadSchema,
      salePreconditionsSchema,
    ),
    envelope(
      'PURCHASE_REGISTER',
      registerPurchasePayloadSchema,
      statePreconditionsSchema,
    ),
    envelope(
      'STOCK_ADJUST',
      adjustStockPayloadSchema,
      statePreconditionsSchema,
    ),
    envelope('SALE_VOID', voidSalePayloadSchema, voidPreconditionsSchema),
    envelope(
      'PURCHASE_VOID',
      voidPurchasePayloadSchema,
      statePreconditionsSchema,
    ),
  ],
} as const;
export type CommandEnvelopeV1 = FromSchema<typeof commandEnvelopeSchema>;
export type CreateProductCommand = Extract<
  CommandEnvelopeV1,
  { commandKind: 'PRODUCT_CREATE' }
>;
export type UpdateProductCommand = Extract<
  CommandEnvelopeV1,
  { commandKind: 'PRODUCT_UPDATE' }
>;
export type ArchiveProductCommand = Extract<
  CommandEnvelopeV1,
  { commandKind: 'PRODUCT_ARCHIVE' }
>;
export type RegisterSaleCommand = Extract<
  CommandEnvelopeV1,
  { commandKind: 'SALE_REGISTER' }
>;
export type RegisterPurchaseCommand = Extract<
  CommandEnvelopeV1,
  { commandKind: 'PURCHASE_REGISTER' }
>;
export type AdjustStockCommand = Extract<
  CommandEnvelopeV1,
  { commandKind: 'STOCK_ADJUST' }
>;
export type VoidSaleCommand = Extract<
  CommandEnvelopeV1,
  { commandKind: 'SALE_VOID' }
>;
export type VoidPurchaseCommand = Extract<
  CommandEnvelopeV1,
  { commandKind: 'PURCHASE_VOID' }
>;
