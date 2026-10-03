import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  domainTimestamps,
  exactInteger,
  safeRange,
  timeChecks,
} from './columns.js';
import { inventories, products } from './catalog.js';
export const sales = pgTable(
  'sales',
  {
    id: uuid('id').primaryKey(),
    inventoryId: uuid('inventory_id')
      .notNull()
      .references(() => inventories.id),
    status: text('status').notNull().default('CONFIRMED'),
    totalAmountUnits: exactInteger('total_amount_units').notNull(),
    estimatedCostUnits: exactInteger('estimated_cost_units'),
    estimatedProfitUnits: exactInteger('estimated_profit_units'),
    notes: text('notes'),
    effectiveAt: exactInteger('effective_at').notNull(),
    ...domainTimestamps(),
  },
  (t) => [
    unique('sales_inventory_id_id_unique').on(t.inventoryId, t.id),
    index('sales_inventory_history_idx').on(
      t.inventoryId,
      t.effectiveAt.desc(),
      t.createdAt.desc(),
      t.id.desc(),
    ),
    check('sales_status_valid', sql`${t.status} IN ('CONFIRMED','VOIDED')`),
    safeRange('sales_total_safe', t.totalAmountUnits, true),
    check('sales_total_positive', sql`${t.totalAmountUnits} > 0`),
    safeRange('sales_cost_safe', t.estimatedCostUnits, true),
    safeRange('sales_profit_safe', t.estimatedProfitUnits),
    check(
      'sales_estimates_pair_valid',
      sql`(${t.estimatedCostUnits} IS NULL AND ${t.estimatedProfitUnits} IS NULL) OR (${t.estimatedCostUnits} IS NOT NULL AND ${t.estimatedProfitUnits} IS NOT NULL)`,
    ),
    check(
      'sales_profit_valid',
      sql`${t.estimatedProfitUnits} IS NULL OR ${t.estimatedProfitUnits} = ${t.totalAmountUnits} - ${t.estimatedCostUnits}`,
    ),
    safeRange('sales_effective_at_safe', t.effectiveAt, true),
    ...timeChecks('sales', t),
  ],
);

export const saleItems = pgTable(
  'sale_items',
  {
    id: uuid('id').primaryKey(),
    inventoryId: uuid('inventory_id').notNull(),
    saleId: uuid('sale_id').notNull(),
    productId: uuid('product_id').notNull(),
    quantity: exactInteger('quantity').notNull(),
    unitSalePriceUnits: exactInteger('unit_sale_price_units').notNull(),
    subtotalUnits: exactInteger('subtotal_units').notNull(),
    unitCostSnapshotUnits: exactInteger('unit_cost_snapshot_units'),
    estimatedCostUnits: exactInteger('estimated_cost_units'),
    estimatedProfitUnits: exactInteger('estimated_profit_units'),
    costStatus: text('cost_status').notNull(),
    ...domainTimestamps(),
  },
  (t) => [
    foreignKey({
      name: 'sale_items_sale_fk',
      columns: [t.inventoryId, t.saleId],
      foreignColumns: [sales.inventoryId, sales.id],
    }),
    foreignKey({
      name: 'sale_items_product_fk',
      columns: [t.inventoryId, t.productId],
      foreignColumns: [products.inventoryId, products.id],
    }),
    index('sale_items_inventory_sale_idx').on(t.inventoryId, t.saleId),
    safeRange('sale_items_quantity_safe', t.quantity, true),
    safeRange('sale_items_price_safe', t.unitSalePriceUnits, true),
    safeRange('sale_items_subtotal_safe', t.subtotalUnits, true),
    safeRange('sale_items_snapshot_safe', t.unitCostSnapshotUnits, true),
    safeRange('sale_items_cost_safe', t.estimatedCostUnits, true),
    safeRange('sale_items_profit_safe', t.estimatedProfitUnits),
    check(
      'sale_items_quantity_price_positive',
      sql`${t.quantity} > 0 AND ${t.unitSalePriceUnits} > 0`,
    ),
    check(
      'sale_items_subtotal_valid',
      sql`${t.subtotalUnits} = ${t.quantity} * ${t.unitSalePriceUnits}`,
    ),
    check(
      'sale_items_cost_state_valid',
      sql`(${t.costStatus} = 'KNOWN' AND ${t.unitCostSnapshotUnits} IS NOT NULL AND ${t.estimatedCostUnits} IS NOT NULL AND ${t.estimatedProfitUnits} IS NOT NULL AND ${t.estimatedCostUnits} = ${t.quantity} * ${t.unitCostSnapshotUnits} AND ${t.estimatedProfitUnits} = ${t.subtotalUnits} - ${t.estimatedCostUnits}) OR (${t.costStatus} = 'UNKNOWN' AND ${t.unitCostSnapshotUnits} IS NULL AND ${t.estimatedCostUnits} IS NULL AND ${t.estimatedProfitUnits} IS NULL)`,
    ),
    ...timeChecks('sale_items', t),
  ],
);

export const purchases = pgTable(
  'purchases',
  {
    id: uuid('id').primaryKey(),
    inventoryId: uuid('inventory_id').notNull(),
    productId: uuid('product_id').notNull(),
    quantity: exactInteger('quantity').notNull(),
    unitCostUnits: exactInteger('unit_cost_units').notNull(),
    totalAmountUnits: exactInteger('total_amount_units').notNull(),
    stockBefore: exactInteger('stock_before').notNull(),
    stockAfter: exactInteger('stock_after').notNull(),
    averageCostBeforeUnits: exactInteger('average_cost_before_units'),
    averageCostAfterUnits: exactInteger('average_cost_after_units').notNull(),
    status: text('status').notNull().default('CONFIRMED'),
    notes: text('notes'),
    effectiveAt: exactInteger('effective_at').notNull(),
    ...domainTimestamps(),
  },
  (t) => [
    foreignKey({
      name: 'purchases_product_fk',
      columns: [t.inventoryId, t.productId],
      foreignColumns: [products.inventoryId, products.id],
    }),
    index('purchases_inventory_history_idx').on(
      t.inventoryId,
      t.effectiveAt.desc(),
      t.createdAt.desc(),
      t.id.desc(),
    ),
    safeRange('purchases_quantity_safe', t.quantity, true),
    check('purchases_quantity_positive', sql`${t.quantity} > 0`),
    safeRange('purchases_unit_cost_safe', t.unitCostUnits, true),
    safeRange('purchases_total_safe', t.totalAmountUnits, true),
    safeRange('purchases_stock_before_safe', t.stockBefore),
    safeRange('purchases_stock_after_safe', t.stockAfter),
    safeRange('purchases_average_before_safe', t.averageCostBeforeUnits, true),
    safeRange('purchases_average_after_safe', t.averageCostAfterUnits, true),
    check('purchases_status_valid', sql`${t.status} IN ('CONFIRMED','VOIDED')`),
    check(
      'purchases_total_valid',
      sql`${t.totalAmountUnits} = ${t.quantity} * ${t.unitCostUnits}`,
    ),
    check(
      'purchases_stock_transition_valid',
      sql`${t.stockAfter} = ${t.stockBefore} + ${t.quantity}`,
    ),
    check(
      'purchases_positive_stock_cost_required',
      sql`${t.stockBefore} <= 0 OR ${t.averageCostBeforeUnits} IS NOT NULL`,
    ),
    check(
      'purchases_nonpositive_stock_cost_valid',
      sql`${t.stockBefore} > 0 OR ${t.averageCostAfterUnits} = ${t.unitCostUnits}`,
    ),
    safeRange('purchases_effective_at_safe', t.effectiveAt, true),
    ...timeChecks('purchases', t),
  ],
);

export const stockAdjustments = pgTable(
  'stock_adjustments',
  {
    id: uuid('id').primaryKey(),
    inventoryId: uuid('inventory_id').notNull(),
    productId: uuid('product_id').notNull(),
    stockBefore: exactInteger('stock_before').notNull(),
    actualStock: exactInteger('actual_stock').notNull(),
    difference: exactInteger('difference').notNull(),
    reason: text('reason').notNull(),
    costMode: text('cost_mode'),
    unitCostUnits: exactInteger('unit_cost_units').notNull(),
    effectiveAt: exactInteger('effective_at').notNull(),
    ...domainTimestamps(),
  },
  (t) => [
    foreignKey({
      name: 'stock_adjustments_product_fk',
      columns: [t.inventoryId, t.productId],
      foreignColumns: [products.inventoryId, products.id],
    }),
    index('stock_adjustments_inventory_history_idx').on(
      t.inventoryId,
      t.effectiveAt.desc(),
      t.createdAt.desc(),
      t.id.desc(),
    ),
    safeRange('stock_adjustments_stock_before_safe', t.stockBefore),
    safeRange('stock_adjustments_actual_stock_safe', t.actualStock, true),
    safeRange('stock_adjustments_difference_safe', t.difference),
    safeRange('stock_adjustments_cost_safe', t.unitCostUnits, true),
    check('stock_adjustments_difference_nonzero', sql`${t.difference} <> 0`),
    check(
      'stock_adjustments_transition_valid',
      sql`${t.actualStock} = ${t.stockBefore} + ${t.difference}`,
    ),
    check(
      'stock_adjustments_reason_valid',
      sql`${t.reason} IN ('COUNT_CORRECTION','DAMAGED','LOST','INTERNAL_USE','OTHER')`,
    ),
    check(
      'stock_adjustments_reason_direction_valid',
      sql`${t.difference} < 0 OR ${t.reason} IN ('COUNT_CORRECTION','OTHER')`,
    ),
    check(
      'stock_adjustments_cost_mode_direction_valid',
      sql`(${t.difference} > 0 AND ${t.costMode} IS NOT NULL AND ${t.costMode} IN ('USE_CURRENT_COST','CUSTOM_COST')) OR (${t.difference} < 0 AND ${t.costMode} IS NULL)`,
    ),
    safeRange('stock_adjustments_effective_at_safe', t.effectiveAt, true),
    ...timeChecks('stock_adjustments', t),
  ],
);

export const inventoryMovements = pgTable(
  'inventory_movements',
  {
    id: uuid('id').primaryKey(),
    inventoryId: uuid('inventory_id').notNull(),
    productId: uuid('product_id').notNull(),
    type: text('type').notNull(),
    quantityDelta: exactInteger('quantity_delta').notNull(),
    unitCostSnapshotUnits: exactInteger('unit_cost_snapshot_units'),
    stockBefore: exactInteger('stock_before').notNull(),
    stockAfter: exactInteger('stock_after').notNull(),
    sourceType: text('source_type'),
    sourceId: uuid('source_id'),
    metadata: text('metadata'),
    effectiveAt: exactInteger('effective_at').notNull(),
    ...domainTimestamps(),
    reversalOfMovementId: uuid('reversal_of_movement_id'),
  },
  (t) => [
    unique('inventory_movements_inventory_id_id_unique').on(
      t.inventoryId,
      t.id,
    ),
    unique('inventory_movements_inventory_product_id_unique').on(
      t.inventoryId,
      t.productId,
      t.id,
    ),
    foreignKey({
      name: 'inventory_movements_product_fk',
      columns: [t.inventoryId, t.productId],
      foreignColumns: [products.inventoryId, products.id],
    }),
    index('inventory_movements_inventory_history_idx').on(
      t.inventoryId,
      t.effectiveAt.desc(),
      t.createdAt.desc(),
      t.id.desc(),
    ),
    index('inventory_movements_product_history_idx').on(
      t.inventoryId,
      t.productId,
      t.effectiveAt.desc(),
      t.createdAt.desc(),
      t.id.desc(),
    ),
    index('inventory_movements_source_idx').on(
      t.inventoryId,
      t.sourceType,
      t.sourceId,
    ),
    foreignKey({
      name: 'inventory_movements_reversal_fk',
      columns: [t.inventoryId, t.productId, t.reversalOfMovementId],
      foreignColumns: [t.inventoryId, t.productId, t.id],
    }),
    uniqueIndex('inventory_movements_reversal_unique')
      .on(t.inventoryId, t.reversalOfMovementId)
      .where(sql`${t.reversalOfMovementId} IS NOT NULL`),
    check(
      'inventory_movements_reversal_type_valid',
      sql`${t.reversalOfMovementId} IS NULL OR (${t.type} = 'REVERSAL' AND ${t.reversalOfMovementId} <> ${t.id})`,
    ),
    check(
      'inventory_movements_type_valid',
      sql`${t.type} IN ('INITIAL_STOCK','PURCHASE','SALE','ADJUSTMENT_IN','ADJUSTMENT_OUT','REVERSAL')`,
    ),
    safeRange('inventory_movements_delta_safe', t.quantityDelta),
    safeRange('inventory_movements_stock_before_safe', t.stockBefore),
    safeRange('inventory_movements_stock_after_safe', t.stockAfter),
    safeRange('inventory_movements_cost_safe', t.unitCostSnapshotUnits, true),
    check('inventory_movements_delta_nonzero', sql`${t.quantityDelta} <> 0`),
    check(
      'inventory_movements_transition_valid',
      sql`${t.stockAfter} = ${t.stockBefore} + ${t.quantityDelta}`,
    ),
    check(
      'inventory_movements_source_pair_valid',
      sql`(${t.sourceType} IS NULL AND ${t.sourceId} IS NULL) OR (${t.sourceType} IS NOT NULL AND ${t.sourceId} IS NOT NULL)`,
    ),
    check('inventory_movements_metadata_v1', sql`${t.metadata} IS NULL`),
    safeRange('inventory_movements_effective_at_safe', t.effectiveAt, true),
    ...timeChecks('inventory_movements', t),
  ],
);
