import type { FromSchema } from 'json-schema-to-ts';
import {
  arrayOf,
  nullable,
  objectSchema,
  optionalTextSchema,
  textSchema,
} from './schema.js';
import {
  cursorSchema,
  moneySchema,
  quantitySchema,
  stockSchema,
  timestampSchema,
  uuidV7Schema,
} from './transport.js';
import {
  adjustmentReasonSchema,
  operationStatusSchema,
  productReadSchema,
} from './entities.js';

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 100;
export const MAX_HISTORY_LIMIT = 50;
export const paginationQuerySchema = {
  type: 'object',
  properties: {
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: MAX_PAGE_LIMIT,
      default: DEFAULT_PAGE_LIMIT,
    },
    cursor: cursorSchema,
  },
  additionalProperties: false,
} as const;
export const productQuerySchema = {
  ...paginationQuerySchema,
  properties: { ...paginationQuerySchema.properties, search: textSchema },
} as const;
export const historyQuerySchema = {
  ...paginationQuerySchema,
  properties: {
    ...paginationQuerySchema.properties,
    limit: {
      ...paginationQuerySchema.properties.limit,
      maximum: MAX_HISTORY_LIMIT,
    },
  },
} as const;
export const barcodeQuerySchema = objectSchema({ code: textSchema });
const historyTimes = {
  effectiveAt: timestampSchema,
  createdAt: timestampSchema,
} as const;
const historyProduct = {
  productId: uuidV7Schema,
  productName: textSchema,
  productVariant: optionalTextSchema,
} as const;
export const historyEntrySchema = {
  oneOf: [
    objectSchema({
      type: { type: 'string', const: 'SALE' },
      id: uuidV7Schema,
      totalAmount: moneySchema,
      units: quantitySchema,
      status: operationStatusSchema,
      ...historyTimes,
    }),
    objectSchema({
      type: { type: 'string', const: 'PURCHASE' },
      id: uuidV7Schema,
      ...historyProduct,
      quantity: quantitySchema,
      unitCost: moneySchema,
      totalAmount: moneySchema,
      status: operationStatusSchema,
      ...historyTimes,
    }),
    objectSchema({
      type: { type: 'string', const: 'ADJUSTMENT' },
      id: uuidV7Schema,
      ...historyProduct,
      difference: stockSchema,
      reason: adjustmentReasonSchema,
      ...historyTimes,
    }),
  ],
} as const;
export const productPageSchema = objectSchema({
  items: arrayOf(productReadSchema),
  nextCursor: nullable(cursorSchema),
});
export const historyPageSchema = objectSchema({
  items: arrayOf(historyEntrySchema),
  nextCursor: nullable(cursorSchema),
});
export const salesSummarySchema = objectSchema({
  totalAmount: moneySchema,
  estimatedProfit: nullable(moneySchema),
  unitsSold: { ...stockSchema, minimum: 0 },
});
export const dashboardSchema = objectSchema({
  fromInclusive: timestampSchema,
  toExclusive: timestampSchema,
  sales: salesSummarySchema,
  lowStock: arrayOf(productReadSchema),
  topSelling: nullable(
    objectSchema({
      productId: uuidV7Schema,
      name: textSchema,
      variant: optionalTextSchema,
      unitsSold: quantitySchema,
    }),
  ),
  recent: arrayOf(historyEntrySchema),
});
export type HistoryEntryDto = FromSchema<typeof historyEntrySchema>;
export type ProductPage = FromSchema<typeof productPageSchema>;
export type HistoryPage = FromSchema<typeof historyPageSchema>;
export type PaginationQuery = FromSchema<typeof paginationQuerySchema>;
export type ProductQuery = FromSchema<typeof productQuerySchema>;
export type HistoryQuery = FromSchema<typeof historyQuerySchema>;
export type DashboardDto = FromSchema<typeof dashboardSchema>;
