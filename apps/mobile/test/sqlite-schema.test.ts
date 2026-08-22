import assert from 'node:assert/strict';
import test from 'node:test';

import { getTableColumns, getTableName } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/sqlite-core';

import {
  inventories,
  inventoryMovements,
  inventoryStates,
  purchases,
  products,
  saleItems,
  sales,
} from '../src/infrastructure/sqlite/schema';

test('defines the seven approved Baseline persistence tables', () => {
  assert.deepEqual(
    [
      inventories,
      products,
      inventoryStates,
      inventoryMovements,
      sales,
      saleItems,
      purchases,
    ].map(getTableName),
    [
      'inventories',
      'products',
      'inventory_states',
      'inventory_movements',
      'sales',
      'sale_items',
      'purchases',
    ],
  );
});

test('stores monetary values and timestamps as SQLite integers', () => {
  const productColumns = getTableColumns(products);
  const movementColumns = getTableColumns(inventoryMovements);
  const saleColumns = getTableColumns(sales);
  const saleItemColumns = getTableColumns(saleItems);
  const purchaseColumns = getTableColumns(purchases);

  assert.equal(productColumns.regularSalePriceUnits.getSQLType(), 'integer');
  assert.equal(productColumns.createdAt.getSQLType(), 'integer');
  assert.equal(productColumns.updatedAt.getSQLType(), 'integer');
  assert.equal(movementColumns.unitCostSnapshotUnits.getSQLType(), 'integer');
  assert.equal(movementColumns.effectiveAt.getSQLType(), 'integer');
  assert.equal(saleColumns.totalAmountUnits.getSQLType(), 'integer');
  assert.equal(saleColumns.estimatedCostUnits.getSQLType(), 'integer');
  assert.equal(saleColumns.estimatedProfitUnits.getSQLType(), 'integer');
  assert.equal(saleColumns.effectiveAt.getSQLType(), 'integer');
  assert.equal(saleColumns.createdAt.getSQLType(), 'integer');
  assert.equal(saleColumns.updatedAt.getSQLType(), 'integer');
  assert.equal(saleItemColumns.unitSalePriceUnits.getSQLType(), 'integer');
  assert.equal(saleItemColumns.subtotalUnits.getSQLType(), 'integer');
  assert.equal(saleItemColumns.unitCostSnapshotUnits.getSQLType(), 'integer');
  assert.equal(saleItemColumns.estimatedCostUnits.getSQLType(), 'integer');
  assert.equal(saleItemColumns.estimatedProfitUnits.getSQLType(), 'integer');
  assert.equal(purchaseColumns.unitCostUnits.getSQLType(), 'integer');
  assert.equal(purchaseColumns.totalAmountUnits.getSQLType(), 'integer');
  assert.equal(purchaseColumns.averageCostBeforeUnits.getSQLType(), 'integer');
  assert.equal(purchaseColumns.averageCostAfterUnits.getSQLType(), 'integer');
  assert.equal(purchaseColumns.effectiveAt.getSQLType(), 'integer');
  assert.equal(purchaseColumns.createdAt.getSQLType(), 'integer');
  assert.equal(purchaseColumns.updatedAt.getSQLType(), 'integer');
});

test('keeps unknown inventory cost nullable and negative stock allowed', () => {
  const stateConfig = getTableConfig(inventoryStates);
  const stock = stateConfig.columns.find((column) => column.name === 'stock');
  const unitCost = stateConfig.columns.find(
    (column) => column.name === 'unit_cost_units',
  );

  assert.equal(stock?.notNull, true);
  assert.equal(unitCost?.notNull, false);
  assert.equal(
    stateConfig.checks.some((constraint) =>
      constraint.name.includes('stock_nonnegative'),
    ),
    false,
  );
});

test('keeps product relationships enforced by foreign keys', () => {
  assert.equal(getTableConfig(products).foreignKeys.length, 1);
  assert.equal(getTableConfig(inventoryStates).foreignKeys.length, 1);
  assert.equal(getTableConfig(inventoryMovements).foreignKeys.length, 1);
  assert.equal(getTableConfig(sales).foreignKeys.length, 1);
  assert.equal(getTableConfig(saleItems).foreignKeys.length, 2);
  assert.equal(getTableConfig(purchases).foreignKeys.length, 1);
});

test('defines exact Purchase columns, nullability, constraints, and history index', () => {
  const columns = getTableColumns(purchases);
  const config = getTableConfig(purchases);

  assert.deepEqual(
    Object.values(columns).map((column) => column.name),
    [
      'id',
      'inventory_id',
      'product_id',
      'quantity',
      'unit_cost_units',
      'total_amount_units',
      'effective_at',
      'created_at',
      'updated_at',
      'status',
      'notes',
      'average_cost_before_units',
      'average_cost_after_units',
      'stock_before',
      'stock_after',
    ],
  );
  assert.equal(columns.id.primary, true);
  assert.equal(columns.inventoryId.notNull, true);
  assert.equal(columns.productId.notNull, true);
  assert.equal(columns.quantity.notNull, true);
  assert.equal(columns.unitCostUnits.notNull, true);
  assert.equal(columns.totalAmountUnits.notNull, true);
  assert.equal(columns.notes.notNull, false);
  assert.equal(columns.averageCostBeforeUnits.notNull, false);
  assert.equal(columns.averageCostAfterUnits.notNull, true);
  assert.equal(columns.stockBefore.notNull, true);
  assert.equal(columns.stockAfter.notNull, true);
  assert.deepEqual(config.checks.map((constraint) => constraint.name).sort(), [
    'purchases_average_cost_after_nonnegative',
    'purchases_average_cost_before_nonnegative',
    'purchases_average_cost_before_required_for_positive_stock',
    'purchases_created_at_nonnegative',
    'purchases_effective_at_nonnegative',
    'purchases_nonpositive_stock_cost_valid',
    'purchases_quantity_positive',
    'purchases_status_valid',
    'purchases_stock_transition_valid',
    'purchases_total_amount_nonnegative',
    'purchases_unit_cost_nonnegative',
    'purchases_updated_at_valid',
  ]);
  assert.deepEqual(
    config.indexes.map((schemaIndex) => schemaIndex.config.name),
    ['purchases_inventory_effective_at_idx'],
  );
});

test('defines exact Sale columns, nullability, constraints, and history index', () => {
  const columns = getTableColumns(sales);
  const config = getTableConfig(sales);

  assert.deepEqual(
    Object.values(columns).map((column) => column.name),
    [
      'id',
      'inventory_id',
      'effective_at',
      'created_at',
      'updated_at',
      'status',
      'total_amount_units',
      'estimated_cost_units',
      'estimated_profit_units',
      'notes',
    ],
  );
  assert.equal(columns.id.primary, true);
  assert.equal(columns.inventoryId.notNull, true);
  assert.equal(columns.totalAmountUnits.notNull, true);
  assert.equal(columns.estimatedCostUnits.notNull, false);
  assert.equal(columns.estimatedProfitUnits.notNull, false);
  assert.equal(columns.notes.notNull, false);
  assert.deepEqual(config.checks.map((constraint) => constraint.name).sort(), [
    'sales_created_at_nonnegative',
    'sales_effective_at_nonnegative',
    'sales_estimated_cost_nonnegative',
    'sales_estimated_profit_valid',
    'sales_estimates_pair_valid',
    'sales_status_valid',
    'sales_total_amount_positive',
    'sales_updated_at_valid',
  ]);
  assert.deepEqual(
    config.indexes.map((schemaIndex) => schemaIndex.config.name),
    ['sales_inventory_effective_at_idx'],
  );
});

test('defines exact SaleItem columns, nullability, constraints, and sale index', () => {
  const columns = getTableColumns(saleItems);
  const config = getTableConfig(saleItems);

  assert.deepEqual(
    Object.values(columns).map((column) => column.name),
    [
      'id',
      'sale_id',
      'product_id',
      'quantity',
      'unit_sale_price_units',
      'subtotal_units',
      'unit_cost_snapshot_units',
      'estimated_cost_units',
      'estimated_profit_units',
      'cost_status',
      'created_at',
      'updated_at',
    ],
  );
  assert.equal(columns.id.primary, true);
  assert.equal(columns.saleId.notNull, true);
  assert.equal(columns.productId.notNull, true);
  assert.equal(columns.quantity.notNull, true);
  assert.equal(columns.unitCostSnapshotUnits.notNull, false);
  assert.equal(columns.estimatedCostUnits.notNull, false);
  assert.equal(columns.estimatedProfitUnits.notNull, false);
  assert.deepEqual(config.checks.map((constraint) => constraint.name).sort(), [
    'sale_items_cost_state_valid',
    'sale_items_cost_status_valid',
    'sale_items_created_at_nonnegative',
    'sale_items_quantity_positive',
    'sale_items_subtotal_positive',
    'sale_items_unit_sale_price_positive',
    'sale_items_updated_at_valid',
  ]);
  assert.deepEqual(
    config.indexes.map((schemaIndex) => schemaIndex.config.name),
    ['sale_items_sale_id_idx'],
  );
});

test('indexes polymorphic InventoryMovement sources without adding a foreign key', () => {
  const config = getTableConfig(inventoryMovements);

  assert.equal(config.foreignKeys.length, 1);
  assert.equal(
    config.indexes.some(
      (schemaIndex) =>
        schemaIndex.config.name === 'inventory_movements_source_idx',
    ),
    true,
  );
});
