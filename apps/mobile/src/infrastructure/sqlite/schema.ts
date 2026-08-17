import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const inventories = sqliteTable(
  'inventories',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    currency: text('currency').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    check('inventories_created_at_nonnegative', sql`${table.createdAt} >= 0`),
    check(
      'inventories_updated_at_valid',
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const products = sqliteTable(
  'products',
  {
    id: text('id').primaryKey(),
    inventoryId: text('inventory_id')
      .notNull()
      .references(() => inventories.id),
    name: text('name').notNull(),
    variant: text('variant'),
    barcode: text('barcode'),
    regularSalePriceUnits: integer('regular_sale_price_units').notNull(),
    minimumStock: integer('minimum_stock'),
    isArchived: integer('is_archived', { mode: 'boolean' })
      .notNull()
      .default(false),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('products_inventory_id_id_unique').on(
      table.inventoryId,
      table.id,
    ),
    uniqueIndex('products_active_barcode_unique')
      .on(table.inventoryId, table.barcode)
      .where(sql`${table.barcode} is not null and ${table.isArchived} = 0`),
    index('products_inventory_id_idx').on(table.inventoryId),
    check(
      'products_regular_sale_price_nonnegative',
      sql`${table.regularSalePriceUnits} >= 0`,
    ),
    check(
      'products_minimum_stock_nonnegative',
      sql`${table.minimumStock} is null or ${table.minimumStock} >= 0`,
    ),
    check('products_is_archived_boolean', sql`${table.isArchived} in (0, 1)`),
    check('products_created_at_nonnegative', sql`${table.createdAt} >= 0`),
    check(
      'products_updated_at_valid',
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const inventoryStates = sqliteTable(
  'inventory_states',
  {
    inventoryId: text('inventory_id').notNull(),
    productId: text('product_id').notNull(),
    stock: integer('stock').notNull(),
    unitCostUnits: integer('unit_cost_units'),
  },
  (table) => [
    primaryKey({ columns: [table.inventoryId, table.productId] }),
    foreignKey({
      name: 'inventory_states_product_fk',
      columns: [table.inventoryId, table.productId],
      foreignColumns: [products.inventoryId, products.id],
    }),
    check(
      'inventory_states_unit_cost_nonnegative',
      sql`${table.unitCostUnits} is null or ${table.unitCostUnits} >= 0`,
    ),
  ],
);

export const inventoryMovements = sqliteTable(
  'inventory_movements',
  {
    id: text('id').primaryKey(),
    inventoryId: text('inventory_id').notNull(),
    productId: text('product_id').notNull(),
    type: text('type', {
      enum: [
        'INITIAL_STOCK',
        'PURCHASE',
        'SALE',
        'ADJUSTMENT_IN',
        'ADJUSTMENT_OUT',
        'REVERSAL',
      ],
    }).notNull(),
    quantityDelta: integer('quantity_delta').notNull(),
    unitCostSnapshotUnits: integer('unit_cost_snapshot_units'),
    stockBefore: integer('stock_before').notNull(),
    stockAfter: integer('stock_after').notNull(),
    sourceType: text('source_type'),
    sourceId: text('source_id'),
    metadata: text('metadata'),
    effectiveAt: integer('effective_at').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    foreignKey({
      name: 'inventory_movements_product_fk',
      columns: [table.inventoryId, table.productId],
      foreignColumns: [products.inventoryId, products.id],
    }),
    index('inventory_movements_inventory_effective_at_idx').on(
      table.inventoryId,
      table.effectiveAt,
    ),
    index('inventory_movements_product_effective_at_idx').on(
      table.productId,
      table.effectiveAt,
    ),
    check(
      'inventory_movements_type_valid',
      sql`${table.type} in ('INITIAL_STOCK', 'PURCHASE', 'SALE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'REVERSAL')`,
    ),
    check(
      'inventory_movements_quantity_nonzero',
      sql`${table.quantityDelta} <> 0`,
    ),
    check(
      'inventory_movements_stock_transition_valid',
      sql`${table.stockAfter} = ${table.stockBefore} + ${table.quantityDelta}`,
    ),
    check(
      'inventory_movements_cost_nonnegative',
      sql`${table.unitCostSnapshotUnits} is null or ${table.unitCostSnapshotUnits} >= 0`,
    ),
    check(
      'inventory_movements_source_pair_valid',
      sql`(${table.sourceType} is null and ${table.sourceId} is null) or (${table.sourceType} is not null and ${table.sourceId} is not null)`,
    ),
    check(
      'inventory_movements_effective_at_nonnegative',
      sql`${table.effectiveAt} >= 0`,
    ),
    check(
      'inventory_movements_created_at_nonnegative',
      sql`${table.createdAt} >= 0`,
    ),
    check(
      'inventory_movements_updated_at_valid',
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  ],
);
