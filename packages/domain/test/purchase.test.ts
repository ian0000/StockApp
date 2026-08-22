import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPurchase,
  type CreatePurchaseInput,
  Money,
  type PurchaseStatus,
} from '../src/index';

const CREATED_AT = 1_776_444_000_000;

function validPurchaseInput(): CreatePurchaseInput {
  return {
    id: 'purchase-local-1',
    inventoryId: 'inventory-local-1',
    productId: 'product-local-1',
    quantity: 10,
    unitCost: Money.fromDecimal('12'),
    totalAmount: Money.fromDecimal('120'),
    effectiveAt: CREATED_AT - 10_000,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    status: 'CONFIRMED',
    notes: 'Proveedor habitual',
    averageCostBefore: Money.fromDecimal('10'),
    averageCostAfter: Money.fromDecimal('10.666667'),
    stockBefore: 20,
    stockAfter: 30,
  };
}

test('creates a valid confirmed Purchase with exact historical snapshots', () => {
  const input = validPurchaseInput();
  const purchase = createPurchase(input);

  assert.equal(purchase.id, 'purchase-local-1');
  assert.equal(purchase.inventoryId, 'inventory-local-1');
  assert.equal(purchase.productId, 'product-local-1');
  assert.equal(purchase.quantity, 10);
  assert.strictEqual(purchase.unitCost, input.unitCost);
  assert.strictEqual(purchase.totalAmount, input.totalAmount);
  assert.equal(purchase.status, 'CONFIRMED');
  assert.equal(purchase.notes, 'Proveedor habitual');
  assert.strictEqual(purchase.averageCostBefore, input.averageCostBefore);
  assert.strictEqual(purchase.averageCostAfter, input.averageCostAfter);
  assert.equal(purchase.stockBefore, 20);
  assert.equal(purchase.stockAfter, 30);
});

test('trims opaque Purchase, Inventory and Product identifiers', () => {
  const purchase = createPurchase({
    ...validPurchaseInput(),
    id: '  custom-purchase-id  ',
    inventoryId: '  custom-inventory-id  ',
    productId: '  custom-product-id  ',
  });

  assert.equal(purchase.id, 'custom-purchase-id');
  assert.equal(purchase.inventoryId, 'custom-inventory-id');
  assert.equal(purchase.productId, 'custom-product-id');
});

test('rejects empty Purchase, Inventory and Product identifiers', () => {
  assert.throws(
    () => createPurchase({ ...validPurchaseInput(), id: '   ' }),
    /purchase id.*empty/i,
  );
  assert.throws(
    () => createPurchase({ ...validPurchaseInput(), inventoryId: '' }),
    /inventory id.*empty/i,
  );
  assert.throws(
    () => createPurchase({ ...validPurchaseInput(), productId: '\t' }),
    /product id.*empty/i,
  );
});

test('accepts only CONFIRMED and VOIDED Purchase statuses', () => {
  assert.equal(createPurchase(validPurchaseInput()).status, 'CONFIRMED');
  assert.equal(
    createPurchase({ ...validPurchaseInput(), status: 'VOIDED' }).status,
    'VOIDED',
  );

  assert.throws(
    () =>
      createPurchase({
        ...validPurchaseInput(),
        status: 'PENDING' as PurchaseStatus,
      }),
    /purchase status/i,
  );
});

test('requires purchase quantity to be a positive safe integer', () => {
  for (const quantity of [0, -1]) {
    assert.throws(
      () => createPurchase({ ...validPurchaseInput(), quantity }),
      /purchase quantity.*greater than zero/i,
    );
  }

  for (const quantity of [1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => createPurchase({ ...validPurchaseInput(), quantity }),
      /purchase quantity.*safe integer/i,
    );
  }
});

test('preserves six-decimal purchase costs and validates the exact total', () => {
  const unitCost = Money.fromDecimal('0.123456');
  const purchase = createPurchase({
    ...validPurchaseInput(),
    quantity: 3,
    unitCost,
    totalAmount: Money.fromDecimal('0.370368'),
    stockBefore: 0,
    stockAfter: 3,
    averageCostBefore: null,
    averageCostAfter: unitCost,
  });

  assert.equal(purchase.unitCost.scaledUnits, 123_456);
  assert.equal(purchase.totalAmount.scaledUnits, 370_368);
});

test('rejects a total inconsistent with unit cost times quantity', () => {
  assert.throws(
    () =>
      createPurchase({
        ...validPurchaseInput(),
        totalAmount: Money.fromDecimal('119.999999'),
      }),
    /total amount.*unit cost.*quantity/i,
  );
});

test('rejects negative purchase unit cost', () => {
  assert.throws(
    () =>
      createPurchase({
        ...validPurchaseInput(),
        unitCost: Money.fromDecimal('-0.000001'),
      }),
    /purchase unit cost.*negative/i,
  );
});

test('accepts a known zero purchase cost and preserves it as zero', () => {
  const zero = Money.zero();
  const purchase = createPurchase({
    ...validPurchaseInput(),
    quantity: 5,
    unitCost: zero,
    totalAmount: zero,
    stockBefore: 0,
    stockAfter: 5,
    averageCostBefore: null,
    averageCostAfter: zero,
  });

  assert.strictEqual(purchase.unitCost, zero);
  assert.strictEqual(purchase.averageCostAfter, zero);
  assert.equal(purchase.totalAmount.scaledUnits, 0);
});

test('requires average cost before when stock before is positive', () => {
  assert.throws(
    () =>
      createPurchase({
        ...validPurchaseInput(),
        averageCostBefore: null,
      }),
    /inventory unit cost.*required|average cost before.*required/i,
  );
});

test('validates weighted average cost after for positive stock', () => {
  const purchase = createPurchase(validPurchaseInput());

  assert.equal(purchase.averageCostAfter.scaledUnits, 10_666_667);

  assert.throws(
    () =>
      createPurchase({
        ...validPurchaseInput(),
        averageCostAfter: Money.fromDecimal('10.666666'),
      }),
    /average cost after.*purchase rules/i,
  );
});

test('accepts zero stock with unknown previous cost and uses purchase cost after', () => {
  const unitCost = Money.fromDecimal('2');
  const purchase = createPurchase({
    ...validPurchaseInput(),
    quantity: 5,
    unitCost,
    totalAmount: Money.fromDecimal('10'),
    stockBefore: 0,
    stockAfter: 5,
    averageCostBefore: null,
    averageCostAfter: unitCost,
  });

  assert.equal(purchase.averageCostBefore, null);
  assert.strictEqual(purchase.averageCostAfter, unitCost);
});

test('zero stock preserves a known previous snapshot but does not average it', () => {
  const previousCost = Money.fromDecimal('1.5');
  const unitCost = Money.fromDecimal('2');
  const purchase = createPurchase({
    ...validPurchaseInput(),
    quantity: 5,
    unitCost,
    totalAmount: Money.fromDecimal('10'),
    stockBefore: 0,
    stockAfter: 5,
    averageCostBefore: previousCost,
    averageCostAfter: unitCost,
  });

  assert.strictEqual(purchase.averageCostBefore, previousCost);
  assert.strictEqual(purchase.averageCostAfter, unitCost);
});

test('negative stock with unknown previous cost may remain negative', () => {
  const unitCost = Money.fromDecimal('2');
  const purchase = createPurchase({
    ...validPurchaseInput(),
    quantity: 4,
    unitCost,
    totalAmount: Money.fromDecimal('8'),
    stockBefore: -10,
    stockAfter: -6,
    averageCostBefore: null,
    averageCostAfter: unitCost,
  });

  assert.equal(purchase.stockAfter, -6);
  assert.equal(purchase.averageCostBefore, null);
  assert.strictEqual(purchase.averageCostAfter, unitCost);
});

test('negative stock with known previous cost may cross into positive stock', () => {
  const previousCost = Money.fromDecimal('10');
  const unitCost = Money.fromDecimal('14');
  const purchase = createPurchase({
    ...validPurchaseInput(),
    quantity: 10,
    unitCost,
    totalAmount: Money.fromDecimal('140'),
    stockBefore: -3,
    stockAfter: 7,
    averageCostBefore: previousCost,
    averageCostAfter: unitCost,
  });

  assert.strictEqual(purchase.averageCostBefore, previousCost);
  assert.strictEqual(purchase.averageCostAfter, unitCost);
});

test('rejects an average cost after inconsistent with zero or negative stock rules', () => {
  assert.throws(
    () =>
      createPurchase({
        ...validPurchaseInput(),
        quantity: 2,
        unitCost: Money.fromDecimal('12'),
        totalAmount: Money.fromDecimal('24'),
        stockBefore: -5,
        stockAfter: -3,
        averageCostBefore: Money.fromDecimal('10'),
        averageCostAfter: Money.fromDecimal('10'),
      }),
    /average cost after.*purchase rules/i,
  );
});

test('rejects negative average cost snapshots', () => {
  assert.throws(
    () =>
      createPurchase({
        ...validPurchaseInput(),
        stockBefore: 0,
        stockAfter: 10,
        averageCostBefore: Money.fromDecimal('-1'),
        averageCostAfter: Money.fromDecimal('12'),
      }),
    /inventory unit cost.*negative|average cost before.*negative/i,
  );
  assert.throws(
    () =>
      createPurchase({
        ...validPurchaseInput(),
        averageCostAfter: Money.fromDecimal('-1'),
      }),
    /average cost after.*purchase rules|negative/i,
  );
});

test('requires stock after to equal stock before plus quantity', () => {
  assert.throws(
    () => createPurchase({ ...validPurchaseInput(), stockAfter: 29 }),
    /stock after.*stock before.*quantity/i,
  );
});

test('requires stock snapshots and their sum to remain safe integers', () => {
  assert.throws(
    () => createPurchase({ ...validPurchaseInput(), stockBefore: 1.5 }),
    /inventory stock.*safe integer|stock before.*safe integer/i,
  );
  assert.throws(
    () =>
      createPurchase({
        ...validPurchaseInput(),
        quantity: 1,
        unitCost: Money.zero(),
        totalAmount: Money.zero(),
        stockBefore: Number.MAX_SAFE_INTEGER,
        stockAfter: Number.MAX_SAFE_INTEGER,
        averageCostBefore: Money.zero(),
        averageCostAfter: Money.zero(),
      }),
    /resulting stock.*safe integer|stock calculation.*safe integer/i,
  );
});

test('fails explicitly when total multiplication exceeds safe Money units', () => {
  const unitCost = Money.fromScaledUnits(Number.MAX_SAFE_INTEGER);

  assert.throws(
    () =>
      createPurchase({
        ...validPurchaseInput(),
        quantity: 2,
        unitCost,
        totalAmount: Money.zero(),
        stockBefore: 0,
        stockAfter: 2,
        averageCostBefore: null,
        averageCostAfter: unitCost,
      }),
    /scaled units.*safe integer/i,
  );
});

test('preserves valid timestamps without ordering effectiveAt against createdAt', () => {
  const purchase = createPurchase({
    ...validPurchaseInput(),
    effectiveAt: CREATED_AT - 50_000,
    updatedAt: CREATED_AT + 1_000,
  });

  assert.equal(purchase.effectiveAt, CREATED_AT - 50_000);
  assert.equal(purchase.createdAt, CREATED_AT);
  assert.equal(purchase.updatedAt, CREATED_AT + 1_000);
});

test('rejects invalid Purchase timestamps and updatedAt before createdAt', () => {
  assert.throws(
    () => createPurchase({ ...validPurchaseInput(), effectiveAt: -1 }),
    /effective at.*non-negative/i,
  );
  assert.throws(
    () => createPurchase({ ...validPurchaseInput(), createdAt: 1.5 }),
    /created at.*safe integer/i,
  );
  assert.throws(
    () =>
      createPurchase({
        ...validPurchaseInput(),
        updatedAt: Number.MAX_SAFE_INTEGER + 1,
      }),
    /updated at.*safe integer/i,
  );
  assert.throws(
    () =>
      createPurchase({ ...validPurchaseInput(), updatedAt: CREATED_AT - 1 }),
    /updated at.*before.*created at/i,
  );
});

test('normalizes omitted, null, empty and whitespace-only notes to null', () => {
  const { notes: _notes, ...withoutNotes } = validPurchaseInput();

  assert.equal(createPurchase(withoutNotes).notes, null);
  assert.equal(
    createPurchase({ ...validPurchaseInput(), notes: null }).notes,
    null,
  );
  assert.equal(
    createPurchase({ ...validPurchaseInput(), notes: '' }).notes,
    null,
  );
  assert.equal(
    createPurchase({ ...validPurchaseInput(), notes: '   ' }).notes,
    null,
  );
});

test('trims note edges while preserving internal whitespace and line breaks', () => {
  const purchase = createPurchase({
    ...validPurchaseInput(),
    notes: '  proveedor  habitual\nentrega viernes  ',
  });

  assert.equal(purchase.notes, 'proveedor  habitual\nentrega viernes');
});

test('creates an immutable Purchase without mutating its input', () => {
  const input = {
    ...validPurchaseInput(),
    id: '  purchase-local-1  ',
    notes: '  Nota  ',
  };
  const original = { ...input };
  const purchase = createPurchase(input);

  assert.ok(Object.isFrozen(purchase));
  assert.throws(() => Object.assign(purchase, { status: 'VOIDED' }), TypeError);
  assert.deepEqual(input, original);
});

test('does not contain PurchaseItems, movements or persistence collections', () => {
  const purchase = createPurchase(validPurchaseInput());

  assert.equal('items' in purchase, false);
  assert.equal('purchaseItems' in purchase, false);
  assert.equal('movements' in purchase, false);
});
