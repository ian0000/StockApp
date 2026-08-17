import assert from 'node:assert/strict';
import test from 'node:test';

import { getTableColumns, getTableName } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/sqlite-core';

import {
  inventories,
  inventoryMovements,
  inventoryStates,
  products,
} from '../src/infrastructure/sqlite/schema';

test('defines only the four Baseline persistence tables', () => {
  assert.deepEqual(
    [inventories, products, inventoryStates, inventoryMovements].map(
      getTableName,
    ),
    ['inventories', 'products', 'inventory_states', 'inventory_movements'],
  );
});

test('stores monetary values and timestamps as SQLite integers', () => {
  const productColumns = getTableColumns(products);
  const movementColumns = getTableColumns(inventoryMovements);

  assert.equal(productColumns.regularSalePriceUnits.getSQLType(), 'integer');
  assert.equal(productColumns.createdAt.getSQLType(), 'integer');
  assert.equal(productColumns.updatedAt.getSQLType(), 'integer');
  assert.equal(movementColumns.unitCostSnapshotUnits.getSQLType(), 'integer');
  assert.equal(movementColumns.effectiveAt.getSQLType(), 'integer');
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
});
