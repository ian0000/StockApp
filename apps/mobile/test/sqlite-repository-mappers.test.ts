import assert from 'node:assert/strict';
import test from 'node:test';

import type { SaveInventoryStateInput } from '@stock-app/application';
import {
  createInventoryMovement,
  createProduct,
  createPurchase,
  createSale,
  createSaleItem,
  createStockAdjustment,
  Money,
  type InventoryMovement,
} from '@stock-app/domain';

import {
  mapInventoryMovementToRow,
  mapInventoryStateToRow,
  mapProductToRow,
  mapPurchaseToRow,
  mapSaleItemToRow,
  mapSaleToRow,
  mapStockAdjustmentToRow,
} from '../src/infrastructure/sqlite/repositories/mappers';
import { products } from '../src/infrastructure/sqlite/schema';

const TIMESTAMP = 1_776_444_000_000;

function createMovement(
  overrides: Partial<InventoryMovement> = {},
): InventoryMovement {
  return createInventoryMovement({
    id: 'movement-123',
    inventoryId: 'inventory-123',
    productId: 'product-123',
    type: 'SALE',
    quantityDelta: -2,
    unitCostSnapshot: Money.fromDecimal('0.750001'),
    stockBefore: 5,
    stockAfter: 3,
    sourceType: 'SALE',
    sourceId: 'sale-123',
    metadata: null,
    effectiveAt: TIMESTAMP,
    createdAt: TIMESTAMP + 1,
    updatedAt: TIMESTAMP + 2,
    ...overrides,
  });
}

test('maps every Product field to its persistence representation', () => {
  const product = createProduct({
    id: 'product-123',
    inventoryId: 'inventory-123',
    name: 'Coffee',
    variant: 'Dark roast',
    barcode: '000123456789',
    regularSalePrice: Money.fromDecimal('2.750001'),
    minimumStock: 12,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP + 1,
  });

  assert.deepEqual(mapProductToRow(product), {
    id: 'product-123',
    inventoryId: 'inventory-123',
    name: 'Coffee',
    variant: 'Dark roast',
    barcode: '000123456789',
    regularSalePriceUnits: 2_750_001,
    minimumStock: 12,
    isArchived: false,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP + 1,
  });
});

test('maps nullable Product fields and archived state without substitutes', () => {
  const product = createProduct({
    id: 'product-123',
    inventoryId: 'inventory-123',
    name: 'Coffee',
    regularSalePrice: Money.zero(),
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  });

  assert.deepEqual(mapProductToRow({ ...product, isArchived: true }), {
    id: 'product-123',
    inventoryId: 'inventory-123',
    name: 'Coffee',
    variant: null,
    barcode: null,
    regularSalePriceUnits: 0,
    minimumStock: null,
    isArchived: true,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  });
  assert.equal(products.isArchived.mapToDriverValue(true), 1);
  assert.equal(products.isArchived.mapToDriverValue(false), 0);
});

test('maps every Purchase field to exact persistence values', () => {
  const purchase = createPurchase({
    id: 'purchase-123',
    inventoryId: 'inventory-123',
    productId: 'product-123',
    quantity: 10,
    unitCost: Money.fromDecimal('12'),
    totalAmount: Money.fromDecimal('120'),
    effectiveAt: TIMESTAMP,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP + 1,
    status: 'CONFIRMED',
    notes: 'Supplier delivery',
    averageCostBefore: Money.fromDecimal('10'),
    averageCostAfter: Money.fromDecimal('10.666667'),
    stockBefore: 20,
    stockAfter: 30,
  });

  assert.deepEqual(mapPurchaseToRow(purchase), {
    id: 'purchase-123',
    inventoryId: 'inventory-123',
    productId: 'product-123',
    quantity: 10,
    unitCostUnits: 12_000_000,
    totalAmountUnits: 120_000_000,
    effectiveAt: TIMESTAMP,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP + 1,
    status: 'CONFIRMED',
    notes: 'Supplier delivery',
    averageCostBeforeUnits: 10_000_000,
    averageCostAfterUnits: 10_666_667,
    stockBefore: 20,
    stockAfter: 30,
  });
});

test('Purchase mapping preserves null, known zero and negative stock snapshots', () => {
  const purchase = createPurchase({
    id: 'purchase-negative',
    inventoryId: 'inventory-123',
    productId: 'product-123',
    quantity: 4,
    unitCost: Money.zero(),
    totalAmount: Money.zero(),
    effectiveAt: TIMESTAMP,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    status: 'CONFIRMED',
    notes: null,
    averageCostBefore: null,
    averageCostAfter: Money.zero(),
    stockBefore: -10,
    stockAfter: -6,
  });
  const row = mapPurchaseToRow(purchase);

  assert.equal(row.unitCostUnits, 0);
  assert.equal(row.totalAmountUnits, 0);
  assert.equal(row.averageCostBeforeUnits, null);
  assert.equal(row.averageCostAfterUnits, 0);
  assert.equal(row.stockBefore, -10);
  assert.equal(row.stockAfter, -6);
  assert.equal(row.notes, null);
});

test('maps positive InventoryState and its scaled cost', () => {
  const input: SaveInventoryStateInput = {
    inventoryId: 'inventory-123',
    productId: 'product-123',
    state: { stock: 8, unitCost: Money.fromDecimal('1.250001') },
  };

  assert.deepEqual(mapInventoryStateToRow(input), {
    inventoryId: 'inventory-123',
    productId: 'product-123',
    stock: 8,
    unitCostUnits: 1_250_001,
  });
});

test('preserves negative stock and unknown cost as null', () => {
  assert.deepEqual(
    mapInventoryStateToRow({
      inventoryId: 'inventory-123',
      productId: 'product-123',
      state: { stock: -3, unitCost: null },
    }),
    {
      inventoryId: 'inventory-123',
      productId: 'product-123',
      stock: -3,
      unitCostUnits: null,
    },
  );
});

test('preserves a known zero inventory cost as zero', () => {
  assert.equal(
    mapInventoryStateToRow({
      inventoryId: 'inventory-123',
      productId: 'product-123',
      state: { stock: 1, unitCost: Money.zero() },
    }).unitCostUnits,
    0,
  );
});

test('maps every InventoryMovement field and scaled snapshot', () => {
  assert.deepEqual(mapInventoryMovementToRow(createMovement()), {
    id: 'movement-123',
    inventoryId: 'inventory-123',
    productId: 'product-123',
    type: 'SALE',
    quantityDelta: -2,
    unitCostSnapshotUnits: 750_001,
    stockBefore: 5,
    stockAfter: 3,
    sourceType: 'SALE',
    sourceId: 'sale-123',
    metadata: null,
    effectiveAt: TIMESTAMP,
    createdAt: TIMESTAMP + 1,
    updatedAt: TIMESTAMP + 2,
  });
});

test('distinguishes null and zero movement cost snapshots', () => {
  const withoutCost = createMovement({
    unitCostSnapshot: null,
    sourceType: null,
    sourceId: null,
  });
  const zeroCost = createMovement({ unitCostSnapshot: Money.zero() });

  assert.equal(
    mapInventoryMovementToRow(withoutCost).unitCostSnapshotUnits,
    null,
  );
  assert.equal(mapInventoryMovementToRow(zeroCost).unitCostSnapshotUnits, 0);
});

test('maps every Sale field to exact scaled persistence values', () => {
  const sale = createSale({
    id: 'sale-123',
    inventoryId: 'inventory-123',
    effectiveAt: TIMESTAMP,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    status: 'CONFIRMED',
    totalAmount: Money.fromDecimal('3.25'),
    estimatedCost: Money.fromDecimal('1.5'),
    estimatedProfit: Money.fromDecimal('1.75'),
    notes: 'Cliente frecuente',
  });

  assert.deepEqual(mapSaleToRow(sale), {
    id: 'sale-123',
    inventoryId: 'inventory-123',
    effectiveAt: TIMESTAMP,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    status: 'CONFIRMED',
    totalAmountUnits: 3_250_000,
    estimatedCostUnits: 1_500_000,
    estimatedProfitUnits: 1_750_000,
    notes: 'Cliente frecuente',
  });
});

test('maps unknown Sale estimates and absent notes to null', () => {
  const sale = createSale({
    id: 'sale-unknown',
    inventoryId: 'inventory-123',
    effectiveAt: TIMESTAMP,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    status: 'CONFIRMED',
    totalAmount: Money.fromDecimal('1'),
    estimatedCost: null,
    estimatedProfit: null,
  });

  assert.equal(mapSaleToRow(sale).estimatedCostUnits, null);
  assert.equal(mapSaleToRow(sale).estimatedProfitUnits, null);
  assert.equal(mapSaleToRow(sale).notes, null);
});

test('maps known SaleItem snapshots including known zero cost', () => {
  const item = createSaleItem({
    id: 'item-123',
    saleId: 'sale-123',
    productId: 'product-123',
    quantity: 2,
    unitSalePrice: Money.fromDecimal('1.25'),
    subtotal: Money.fromDecimal('2.5'),
    unitCostSnapshot: Money.zero(),
    estimatedCost: Money.zero(),
    estimatedProfit: Money.fromDecimal('2.5'),
    costStatus: 'KNOWN',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  });

  assert.deepEqual(mapSaleItemToRow(item), {
    id: 'item-123',
    saleId: 'sale-123',
    productId: 'product-123',
    quantity: 2,
    unitSalePriceUnits: 1_250_000,
    subtotalUnits: 2_500_000,
    unitCostSnapshotUnits: 0,
    estimatedCostUnits: 0,
    estimatedProfitUnits: 2_500_000,
    costStatus: 'KNOWN',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  });
});

test('maps unknown SaleItem cost fields to null without substituting zero', () => {
  const item = createSaleItem({
    id: 'item-unknown',
    saleId: 'sale-123',
    productId: 'product-123',
    quantity: 1,
    unitSalePrice: Money.fromDecimal('0.75'),
    subtotal: Money.fromDecimal('0.75'),
    unitCostSnapshot: null,
    estimatedCost: null,
    estimatedProfit: null,
    costStatus: 'UNKNOWN',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  });

  const row = mapSaleItemToRow(item);

  assert.equal(row.unitCostSnapshotUnits, null);
  assert.equal(row.estimatedCostUnits, null);
  assert.equal(row.estimatedProfitUnits, null);
  assert.equal(row.costStatus, 'UNKNOWN');
});

test('maps a negative SaleItem estimated profit exactly', () => {
  const item = createSaleItem({
    id: 'item-loss',
    saleId: 'sale-123',
    productId: 'product-123',
    quantity: 1,
    unitSalePrice: Money.fromDecimal('0.25'),
    subtotal: Money.fromDecimal('0.25'),
    unitCostSnapshot: Money.fromDecimal('0.75'),
    estimatedCost: Money.fromDecimal('0.75'),
    estimatedProfit: Money.fromDecimal('-0.5'),
    costStatus: 'KNOWN',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP + 1,
  });

  const row = mapSaleItemToRow(item);

  assert.equal(row.estimatedProfitUnits, -500_000);
  assert.equal(row.createdAt, TIMESTAMP);
  assert.equal(row.updatedAt, TIMESTAMP + 1);
});

test('maps a positive StockAdjustment to exact persistence values', () => {
  const adjustment = createStockAdjustment({
    id: 'adjustment-1',
    inventoryId: 'inventory-123',
    productId: 'product-123',
    stockBefore: 10,
    actualStock: 15,
    difference: 5,
    reason: 'COUNT_CORRECTION',
    costMode: 'CUSTOM_COST',
    unitCost: Money.fromDecimal('4.000001'),
    effectiveAt: TIMESTAMP,
    createdAt: TIMESTAMP + 1,
    updatedAt: TIMESTAMP + 2,
  });

  assert.deepEqual(mapStockAdjustmentToRow(adjustment), {
    id: 'adjustment-1',
    inventoryId: 'inventory-123',
    productId: 'product-123',
    stockBefore: 10,
    actualStock: 15,
    difference: 5,
    reason: 'COUNT_CORRECTION',
    costMode: 'CUSTOM_COST',
    unitCostUnits: 4_000_001,
    effectiveAt: TIMESTAMP,
    createdAt: TIMESTAMP + 1,
    updatedAt: TIMESTAMP + 2,
  });
});

test('maps negative StockAdjustment null mode and known zero cost', () => {
  const row = mapStockAdjustmentToRow(
    createStockAdjustment({
      id: 'adjustment-zero',
      inventoryId: 'inventory-123',
      productId: 'product-123',
      stockBefore: 3,
      actualStock: 1,
      difference: -2,
      reason: 'DAMAGED',
      costMode: null,
      unitCost: Money.zero(),
      effectiveAt: TIMESTAMP,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    }),
  );

  assert.equal(row.difference, -2);
  assert.equal(row.costMode, null);
  assert.equal(row.unitCostUnits, 0);
});
