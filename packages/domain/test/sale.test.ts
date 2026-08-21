import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSale,
  type CreateSaleInput,
  Money,
  type SaleStatus,
} from '../src/index';

const CREATED_AT = 1_776_444_000_000;

function validSaleInput(): CreateSaleInput {
  return {
    id: 'sale-local-1',
    inventoryId: 'inventory-local-1',
    effectiveAt: CREATED_AT - 10_000,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    status: 'CONFIRMED',
    totalAmount: Money.fromDecimal('5.5'),
    estimatedCost: Money.fromDecimal('3.68'),
    estimatedProfit: Money.fromDecimal('1.82'),
    notes: 'Cliente recoge mañana',
  };
}

test('creates a valid confirmed Sale with financial snapshots', () => {
  const input = validSaleInput();
  const sale = createSale(input);

  assert.equal(sale.id, 'sale-local-1');
  assert.equal(sale.inventoryId, 'inventory-local-1');
  assert.equal(sale.status, 'CONFIRMED');
  assert.strictEqual(sale.totalAmount, input.totalAmount);
  assert.strictEqual(sale.estimatedCost, input.estimatedCost);
  assert.strictEqual(sale.estimatedProfit, input.estimatedProfit);
  assert.equal(sale.notes, 'Cliente recoge mañana');
});

test('trims opaque Sale and Inventory identifiers', () => {
  const sale = createSale({
    ...validSaleInput(),
    id: '  custom-sale-id  ',
    inventoryId: '  custom-inventory-id  ',
  });

  assert.equal(sale.id, 'custom-sale-id');
  assert.equal(sale.inventoryId, 'custom-inventory-id');
});

test('rejects empty Sale and Inventory identifiers', () => {
  assert.throws(
    () => createSale({ ...validSaleInput(), id: '   ' }),
    /sale id.*empty/i,
  );
  assert.throws(
    () => createSale({ ...validSaleInput(), inventoryId: '' }),
    /inventory id.*empty/i,
  );
});

test('accepts only CONFIRMED and VOIDED Sale statuses', () => {
  assert.equal(createSale(validSaleInput()).status, 'CONFIRMED');
  assert.equal(
    createSale({ ...validSaleInput(), status: 'VOIDED' }).status,
    'VOIDED',
  );

  assert.throws(
    () =>
      createSale({
        ...validSaleInput(),
        status: 'PENDING' as SaleStatus,
      }),
    /sale status/i,
  );
});

test('preserves valid TimestampMs values without ordering effectiveAt against createdAt', () => {
  const sale = createSale({
    ...validSaleInput(),
    effectiveAt: CREATED_AT - 50_000,
    updatedAt: CREATED_AT + 1_000,
  });

  assert.equal(sale.effectiveAt, CREATED_AT - 50_000);
  assert.equal(sale.createdAt, CREATED_AT);
  assert.equal(sale.updatedAt, CREATED_AT + 1_000);
});

test('rejects invalid Sale timestamps', () => {
  assert.throws(
    () => createSale({ ...validSaleInput(), effectiveAt: -1 }),
    /effective at.*non-negative/i,
  );
  assert.throws(
    () => createSale({ ...validSaleInput(), createdAt: 1.5 }),
    /created at.*safe integer/i,
  );
  assert.throws(
    () =>
      createSale({
        ...validSaleInput(),
        updatedAt: Number.MAX_SAFE_INTEGER + 1,
      }),
    /updated at.*safe integer/i,
  );
});

test('rejects updatedAt before createdAt', () => {
  assert.throws(
    () => createSale({ ...validSaleInput(), updatedAt: CREATED_AT - 1 }),
    /updated at.*before.*created at/i,
  );
});

test('requires a positive total amount for a normal Sale', () => {
  assert.throws(
    () => createSale({ ...validSaleInput(), totalAmount: Money.zero() }),
    /total amount.*greater than zero/i,
  );
  assert.throws(
    () =>
      createSale({
        ...validSaleInput(),
        totalAmount: Money.fromDecimal('-0.000001'),
      }),
    /total amount.*greater than zero/i,
  );
});

test('requires non-negative known aggregate cost and exact aggregate profit', () => {
  assert.throws(
    () =>
      createSale({
        ...validSaleInput(),
        estimatedCost: Money.fromDecimal('-0.000001'),
      }),
    /estimated cost.*negative/i,
  );
  assert.throws(
    () =>
      createSale({
        ...validSaleInput(),
        estimatedProfit: Money.fromDecimal('1.81'),
      }),
    /estimated profit.*total amount.*estimated cost/i,
  );
});

test('allows a negative estimated profit when the sale is below cost', () => {
  const sale = createSale({
    ...validSaleInput(),
    totalAmount: Money.fromDecimal('8'),
    estimatedCost: Money.fromDecimal('10'),
    estimatedProfit: Money.fromDecimal('-2'),
  });

  assert.equal(sale.estimatedProfit?.scaledUnits, -2_000_000);
});

test('preserves unavailable aggregate estimates as null', () => {
  const sale = createSale({
    ...validSaleInput(),
    estimatedCost: null,
    estimatedProfit: null,
  });

  assert.equal(sale.estimatedCost, null);
  assert.equal(sale.estimatedProfit, null);
  assert.equal(sale.totalAmount.scaledUnits, 5_500_000);
});

test('requires aggregate estimated cost and profit to be both known or both null', () => {
  assert.throws(
    () =>
      createSale({
        ...validSaleInput(),
        estimatedCost: null,
      }),
    /estimated cost and estimated profit.*together/i,
  );
  assert.throws(
    () =>
      createSale({
        ...validSaleInput(),
        estimatedProfit: null,
      }),
    /estimated cost and estimated profit.*together/i,
  );
});

test('normalizes omitted, null, empty and whitespace-only notes to null', () => {
  const { notes: _notes, ...withoutNotes } = validSaleInput();

  assert.equal(createSale(withoutNotes).notes, null);
  assert.equal(createSale({ ...validSaleInput(), notes: null }).notes, null);
  assert.equal(createSale({ ...validSaleInput(), notes: '' }).notes, null);
  assert.equal(createSale({ ...validSaleInput(), notes: '   ' }).notes, null);
});

test('trims note edges while preserving internal whitespace and line breaks', () => {
  const sale = createSale({
    ...validSaleInput(),
    notes: '  Cliente  recoge\nmañana  ',
  });

  assert.equal(sale.notes, 'Cliente  recoge\nmañana');
});

test('creates an immutable Sale without mutating its input', () => {
  const input = {
    ...validSaleInput(),
    id: '  sale-local-1  ',
    notes: '  Nota  ',
  };
  const original = { ...input };
  const sale = createSale(input);

  assert.ok(Object.isFrozen(sale));
  assert.throws(() => Object.assign(sale, { status: 'VOIDED' }), TypeError);
  assert.deepEqual(input, original);
});

test('does not contain SaleItems or persistence collections', () => {
  const sale = createSale(validSaleInput());

  assert.equal('items' in sale, false);
  assert.equal('saleItems' in sale, false);
  assert.equal('movements' in sale, false);
});
