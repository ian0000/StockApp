import assert from 'node:assert/strict';
import test from 'node:test';

import {
  type CostStatus,
  createSaleItem,
  type CreateSaleItemInput,
  Money,
} from '../src/index';

const CREATED_AT = 1_776_444_000_000;

function validKnownSaleItemInput(): CreateSaleItemInput {
  return {
    id: 'sale-item-local-1',
    saleId: 'sale-local-1',
    productId: 'product-local-1',
    quantity: 3,
    unitSalePrice: Money.fromDecimal('1'),
    subtotal: Money.fromDecimal('3'),
    unitCostSnapshot: Money.fromDecimal('0.65'),
    estimatedCost: Money.fromDecimal('1.95'),
    estimatedProfit: Money.fromDecimal('1.05'),
    costStatus: 'KNOWN',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
}

test('creates a valid known-cost SaleItem', () => {
  const input = validKnownSaleItemInput();
  const item = createSaleItem(input);

  assert.equal(item.id, 'sale-item-local-1');
  assert.equal(item.saleId, 'sale-local-1');
  assert.equal(item.productId, 'product-local-1');
  assert.equal(item.quantity, 3);
  assert.strictEqual(item.unitSalePrice, input.unitSalePrice);
  assert.strictEqual(item.subtotal, input.subtotal);
  assert.strictEqual(item.unitCostSnapshot, input.unitCostSnapshot);
  assert.strictEqual(item.estimatedCost, input.estimatedCost);
  assert.strictEqual(item.estimatedProfit, input.estimatedProfit);
  assert.equal(item.costStatus, 'KNOWN');
});

test('trims opaque SaleItem, Sale and Product identifiers', () => {
  const item = createSaleItem({
    ...validKnownSaleItemInput(),
    id: '  custom-item-id  ',
    saleId: '  custom-sale-id  ',
    productId: '  custom-product-id  ',
  });

  assert.equal(item.id, 'custom-item-id');
  assert.equal(item.saleId, 'custom-sale-id');
  assert.equal(item.productId, 'custom-product-id');
});

test('rejects empty SaleItem, Sale and Product identifiers', () => {
  assert.throws(
    () => createSaleItem({ ...validKnownSaleItemInput(), id: ' ' }),
    /sale item id.*empty/i,
  );
  assert.throws(
    () => createSaleItem({ ...validKnownSaleItemInput(), saleId: '' }),
    /sale id.*empty/i,
  );
  assert.throws(
    () => createSaleItem({ ...validKnownSaleItemInput(), productId: '   ' }),
    /product id.*empty/i,
  );
});

test('requires quantity to be a positive safe integer', () => {
  assert.throws(
    () => createSaleItem({ ...validKnownSaleItemInput(), quantity: 0 }),
    /quantity.*greater than zero/i,
  );
  assert.throws(
    () => createSaleItem({ ...validKnownSaleItemInput(), quantity: -1 }),
    /quantity.*greater than zero/i,
  );
  assert.throws(
    () => createSaleItem({ ...validKnownSaleItemInput(), quantity: 1.5 }),
    /quantity.*safe integer/i,
  );
  assert.throws(
    () =>
      createSaleItem({
        ...validKnownSaleItemInput(),
        quantity: Number.MAX_SAFE_INTEGER + 1,
      }),
    /quantity.*safe integer/i,
  );
});

test('requires a positive unit sale price', () => {
  assert.throws(
    () =>
      createSaleItem({
        ...validKnownSaleItemInput(),
        unitSalePrice: Money.zero(),
      }),
    /unit sale price.*greater than zero/i,
  );
  assert.throws(
    () =>
      createSaleItem({
        ...validKnownSaleItemInput(),
        unitSalePrice: Money.fromDecimal('-0.000001'),
      }),
    /unit sale price.*greater than zero/i,
  );
});

test('requires subtotal to equal unit sale price times quantity exactly', () => {
  assert.throws(
    () =>
      createSaleItem({
        ...validKnownSaleItemInput(),
        subtotal: Money.fromDecimal('2.999999'),
      }),
    /subtotal.*unit sale price.*quantity/i,
  );
});

test('preserves six-decimal Money precision in a known-cost line', () => {
  const item = createSaleItem({
    ...validKnownSaleItemInput(),
    quantity: 2,
    unitSalePrice: Money.fromDecimal('1.123456'),
    subtotal: Money.fromDecimal('2.246912'),
    unitCostSnapshot: Money.fromDecimal('0.123456'),
    estimatedCost: Money.fromDecimal('0.246912'),
    estimatedProfit: Money.fromDecimal('2'),
  });

  assert.equal(item.subtotal.scaledUnits, 2_246_912);
  assert.equal(item.estimatedCost?.scaledUnits, 246_912);
  assert.equal(item.estimatedProfit?.scaledUnits, 2_000_000);
});

test('preserves known zero cost as Money.zero()', () => {
  const zeroCost = Money.zero();
  const item = createSaleItem({
    ...validKnownSaleItemInput(),
    unitCostSnapshot: zeroCost,
    estimatedCost: Money.zero(),
    estimatedProfit: Money.fromDecimal('3'),
  });

  assert.strictEqual(item.unitCostSnapshot, zeroCost);
  assert.ok(item.estimatedCost?.equals(Money.zero()));
  assert.equal(item.costStatus, 'KNOWN');
});

test('requires non-negative known unit cost', () => {
  assert.throws(
    () =>
      createSaleItem({
        ...validKnownSaleItemInput(),
        unitCostSnapshot: Money.fromDecimal('-0.000001'),
      }),
    /unit cost snapshot.*negative/i,
  );
});

test('requires exact known estimated cost', () => {
  assert.throws(
    () =>
      createSaleItem({
        ...validKnownSaleItemInput(),
        estimatedCost: Money.fromDecimal('1.949999'),
      }),
    /estimated cost.*unit cost snapshot.*quantity/i,
  );
});

test('requires exact known estimated profit', () => {
  assert.throws(
    () =>
      createSaleItem({
        ...validKnownSaleItemInput(),
        estimatedProfit: Money.fromDecimal('1.049999'),
      }),
    /estimated profit.*subtotal.*estimated cost/i,
  );
});

test('allows a negative estimated profit for a below-cost line', () => {
  const item = createSaleItem({
    ...validKnownSaleItemInput(),
    quantity: 1,
    unitSalePrice: Money.fromDecimal('8'),
    subtotal: Money.fromDecimal('8'),
    unitCostSnapshot: Money.fromDecimal('10'),
    estimatedCost: Money.fromDecimal('10'),
    estimatedProfit: Money.fromDecimal('-2'),
  });

  assert.equal(item.estimatedProfit?.scaledUnits, -2_000_000);
});

test('preserves unknown cost and estimates as null', () => {
  const item = createSaleItem({
    ...validKnownSaleItemInput(),
    unitCostSnapshot: null,
    estimatedCost: null,
    estimatedProfit: null,
    costStatus: 'UNKNOWN',
  });

  assert.equal(item.unitCostSnapshot, null);
  assert.equal(item.estimatedCost, null);
  assert.equal(item.estimatedProfit, null);
  assert.equal(item.costStatus, 'UNKNOWN');
});

test('rejects UNKNOWN cost status when any cost snapshot is present', () => {
  assert.throws(
    () =>
      createSaleItem({
        ...validKnownSaleItemInput(),
        costStatus: 'UNKNOWN',
      }),
    /unknown.*cost.*null/i,
  );
});

test('rejects KNOWN cost status when any cost snapshot is missing', () => {
  for (const missing of [
    { unitCostSnapshot: null },
    { estimatedCost: null },
    { estimatedProfit: null },
  ]) {
    assert.throws(
      () => createSaleItem({ ...validKnownSaleItemInput(), ...missing }),
      /known.*cost.*required/i,
    );
  }
});

test('accepts only KNOWN and UNKNOWN cost statuses', () => {
  assert.throws(
    () =>
      createSaleItem({
        ...validKnownSaleItemInput(),
        costStatus: 'PENDING' as CostStatus,
      }),
    /cost status/i,
  );
});

test('rejects arithmetic overflow in subtotal or estimated cost', () => {
  assert.throws(
    () =>
      createSaleItem({
        ...validKnownSaleItemInput(),
        quantity: Number.MAX_SAFE_INTEGER,
      }),
    /scaled units.*safe integer/i,
  );
});

test('validates SaleItem timestamps and their ordering', () => {
  assert.throws(
    () => createSaleItem({ ...validKnownSaleItemInput(), createdAt: -1 }),
    /created at.*non-negative/i,
  );
  assert.throws(
    () => createSaleItem({ ...validKnownSaleItemInput(), updatedAt: 1.5 }),
    /updated at.*safe integer/i,
  );
  assert.throws(
    () =>
      createSaleItem({
        ...validKnownSaleItemInput(),
        updatedAt: CREATED_AT - 1,
      }),
    /updated at.*before.*created at/i,
  );
});

test('creates an immutable SaleItem without mutating its input', () => {
  const input = {
    ...validKnownSaleItemInput(),
    id: '  sale-item-local-1  ',
  };
  const original = { ...input };
  const item = createSaleItem(input);

  assert.ok(Object.isFrozen(item));
  assert.throws(() => Object.assign(item, { quantity: 4 }), TypeError);
  assert.deepEqual(input, original);
});

test('does not nest Product, Sale, stock or movements', () => {
  const item = createSaleItem(validKnownSaleItemInput());

  assert.equal('product' in item, false);
  assert.equal('sale' in item, false);
  assert.equal('stock' in item, false);
  assert.equal('movement' in item, false);
});
