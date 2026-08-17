import assert from 'node:assert/strict';
import test from 'node:test';

import { createProduct, Money } from '../src/index';

function validProductInput() {
  return {
    id: 'product-local-1',
    inventoryId: 'inventory-local-1',
    name: 'Coca-Cola 500 ml',
    variant: 'Original',
    barcode: '001234567890',
    regularSalePrice: Money.fromDecimal('1.5'),
    minimumStock: 5,
    createdAt: 1_776_444_000_000,
    updatedAt: 1_776_444_000_000,
  };
}

test('creates a valid product', () => {
  const product = createProduct(validProductInput());

  assert.deepEqual(product, {
    id: 'product-local-1',
    inventoryId: 'inventory-local-1',
    name: 'Coca-Cola 500 ml',
    variant: 'Original',
    barcode: '001234567890',
    regularSalePrice: Money.fromDecimal('1.5'),
    minimumStock: 5,
    isArchived: false,
    createdAt: 1_776_444_000_000,
    updatedAt: 1_776_444_000_000,
  });
});

test('trims the product name', () => {
  const product = createProduct({
    ...validProductInput(),
    name: '  Coca-Cola 500 ml  ',
  });

  assert.equal(product.name, 'Coca-Cola 500 ml');
});

test('rejects an empty product name', () => {
  assert.throws(
    () => createProduct({ ...validProductInput(), name: '' }),
    /product name.*empty/i,
  );
});

test('rejects a whitespace-only product name', () => {
  assert.throws(
    () => createProduct({ ...validProductInput(), name: '   ' }),
    /product name.*empty/i,
  );
});

test('preserves the product ID as an opaque identifier', () => {
  const product = createProduct({
    ...validProductInput(),
    id: 'custom-offline-id',
  });

  assert.equal(product.id, 'custom-offline-id');
});

test('rejects an empty product ID', () => {
  assert.throws(
    () => createProduct({ ...validProductInput(), id: '  ' }),
    /product id.*empty/i,
  );
});

test('preserves the inventory ID association', () => {
  const product = createProduct({
    ...validProductInput(),
    inventoryId: 'inventory-offline-id',
  });

  assert.equal(product.inventoryId, 'inventory-offline-id');
});

test('rejects an empty inventory ID', () => {
  assert.throws(
    () => createProduct({ ...validProductInput(), inventoryId: '  ' }),
    /inventory id.*empty/i,
  );
});

test('preserves and trims an optional variant description', () => {
  const product = createProduct({
    ...validProductInput(),
    variant: '  Negra / M  ',
  });

  assert.equal(product.variant, 'Negra / M');
});

test('normalizes an empty optional variant to null', () => {
  const product = createProduct({
    ...validProductInput(),
    variant: '   ',
  });

  assert.equal(product.variant, null);
});

test('preserves a barcode as a string', () => {
  const product = createProduct({
    ...validProductInput(),
    barcode: 'local-code-A1',
  });

  assert.equal(product.barcode, 'local-code-A1');
  assert.equal(typeof product.barcode, 'string');
});

test('preserves leading zeroes in a barcode', () => {
  const product = createProduct({
    ...validProductInput(),
    barcode: '001234567890',
  });

  assert.equal(product.barcode, '001234567890');
});

test('normalizes an empty optional barcode to null', () => {
  const product = createProduct({
    ...validProductInput(),
    barcode: '   ',
  });

  assert.equal(product.barcode, null);
});

test('stores a valid regular sale price', () => {
  const regularSalePrice = Money.fromDecimal('2.75');
  const product = createProduct({
    ...validProductInput(),
    regularSalePrice,
  });

  assert.strictEqual(product.regularSalePrice, regularSalePrice);
});

test('allows a real zero regular sale price', () => {
  const product = createProduct({
    ...validProductInput(),
    regularSalePrice: Money.zero(),
  });

  assert.ok(product.regularSalePrice.equals(Money.zero()));
});

test('rejects a negative regular sale price', () => {
  assert.throws(
    () =>
      createProduct({
        ...validProductInput(),
        regularSalePrice: Money.fromDecimal('-0.000001'),
      }),
    /regular sale price.*negative/i,
  );
});

test('stores a valid minimum stock', () => {
  const product = createProduct({ ...validProductInput(), minimumStock: 12 });

  assert.equal(product.minimumStock, 12);
});

test('allows zero minimum stock', () => {
  const product = createProduct({ ...validProductInput(), minimumStock: 0 });

  assert.equal(product.minimumStock, 0);
});

test('rejects negative minimum stock', () => {
  assert.throws(
    () => createProduct({ ...validProductInput(), minimumStock: -1 }),
    /minimum stock.*negative/i,
  );
});

test('rejects fractional minimum stock', () => {
  assert.throws(
    () => createProduct({ ...validProductInput(), minimumStock: 1.5 }),
    /minimum stock.*safe integer/i,
  );
});

test('rejects unsafe minimum stock', () => {
  assert.throws(
    () =>
      createProduct({
        ...validProductInput(),
        minimumStock: Number.MAX_SAFE_INTEGER + 1,
      }),
    /minimum stock.*safe integer/i,
  );
});

test('creates a product in the active state', () => {
  const product = createProduct(validProductInput());

  assert.equal(product.isArchived, false);
});

test('creates an immutable product', () => {
  const product = createProduct(validProductInput());

  assert.ok(Object.isFrozen(product));
  assert.throws(() => Object.assign(product, { name: 'Changed' }), TypeError);
});

test('does not mutate the Money input', () => {
  const regularSalePrice = Money.fromDecimal('3.125');

  createProduct({ ...validProductInput(), regularSalePrice });

  assert.equal(regularSalePrice.scaledUnits, 3_125_000);
});

test('does not contain inventory state', () => {
  const product = createProduct(validProductInput());

  assert.equal('stock' in product, false);
  assert.equal('currentStock' in product, false);
  assert.equal('averageCost' in product, false);
  assert.equal('currentAverageCost' in product, false);
  assert.equal('lastKnownCost' in product, false);
});

test('does not create an inventory movement', () => {
  const product = createProduct(validProductInput());

  assert.equal('movement' in product, false);
  assert.equal('movements' in product, false);
});

test('normalizes omitted optional fields to null', () => {
  const product = createProduct({
    id: 'product-local-1',
    inventoryId: 'inventory-local-1',
    name: 'Coca-Cola 500 ml',
    regularSalePrice: Money.fromDecimal('1.5'),
    createdAt: 1_776_444_000_000,
    updatedAt: 1_776_444_000_000,
  });

  assert.equal(product.variant, null);
  assert.equal(product.barcode, null);
  assert.equal(product.minimumStock, null);
});
