import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInventoryState,
  createProduct,
  isProductLowStock,
  Money,
  type Product,
} from '../src/index';

function product(overrides: Partial<Product> = {}): Product {
  return Object.freeze({
    ...createProduct({
      id: 'product-1',
      inventoryId: 'inventory-1',
      name: 'Coca-Cola',
      regularSalePrice: Money.fromDecimal('1'),
      minimumStock: 5,
      createdAt: 1,
      updatedAt: 1,
    }),
    ...overrides,
  });
}

function lowStock(stock: number, minimumStock: number | null = 5): boolean {
  return isProductLowStock(
    product({ minimumStock }),
    createInventoryState({
      stock,
      unitCost: stock > 0 ? Money.zero() : null,
    }),
  );
}

test('stock above the configured minimum is not low', () => {
  assert.equal(lowStock(6), false);
});

test('stock exactly equal to the configured minimum is low', () => {
  assert.equal(lowStock(5), true);
});

test('stock below the configured minimum is low', () => {
  assert.equal(lowStock(4), true);
});

test('zero stock is low when the configured minimum is positive', () => {
  assert.equal(lowStock(0), true);
});

test('negative stock is evaluated without clamping', () => {
  assert.equal(lowStock(-3), true);
});

test('known zero minimum is distinct from an absent minimum', () => {
  assert.equal(lowStock(0, 0), true);
  assert.equal(lowStock(1, 0), false);
  assert.equal(lowStock(0, null), false);
  assert.equal(lowStock(-1, null), false);
});

test('an archived Product is excluded from low stock', () => {
  assert.equal(
    isProductLowStock(
      product({ isArchived: true }),
      createInventoryState({ stock: -3, unitCost: null }),
    ),
    false,
  );
});
