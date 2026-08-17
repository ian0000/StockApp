import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInventoryMovement,
  createPurchaseMovement,
  Money,
  type InventoryMovementType,
} from '../src/index';

test('creates a purchase movement', () => {
  const movement = createPurchaseMovement({
    quantity: 5,
    unitCost: Money.fromDecimal('8'),
  });

  assert.equal(movement.type, 'PURCHASE');
});

test('uses the purchased quantity as a positive quantity delta', () => {
  const movement = createPurchaseMovement({
    quantity: 5,
    unitCost: Money.fromDecimal('8'),
  });

  assert.equal(movement.quantityDelta, 5);
});

test('captures the exact purchase unit cost', () => {
  const unitCost = Money.fromDecimal('10.666667');
  const movement = createPurchaseMovement({ quantity: 3, unitCost });

  assert.strictEqual(movement.unitCost, unitCost);
  assert.equal(movement.unitCost?.scaledUnits, 10_666_667);
});

test('supports a real zero purchase unit cost', () => {
  const movement = createPurchaseMovement({
    quantity: 1,
    unitCost: Money.zero(),
  });

  assert.ok(movement.unitCost?.equals(Money.zero()));
});

test('rejects a zero purchase quantity', () => {
  assert.throws(
    () =>
      createPurchaseMovement({
        quantity: 0,
        unitCost: Money.fromDecimal('1'),
      }),
    /purchase quantity.*greater than zero/i,
  );
});

test('rejects a negative purchase quantity', () => {
  assert.throws(
    () =>
      createPurchaseMovement({
        quantity: -1,
        unitCost: Money.fromDecimal('1'),
      }),
    /purchase quantity.*greater than zero/i,
  );
});

test('rejects a fractional purchase quantity', () => {
  assert.throws(
    () =>
      createPurchaseMovement({
        quantity: 1.5,
        unitCost: Money.fromDecimal('1'),
      }),
    /purchase quantity.*safe integer/i,
  );
});

test('rejects an unsafe purchase quantity', () => {
  assert.throws(
    () =>
      createPurchaseMovement({
        quantity: Number.MAX_SAFE_INTEGER + 1,
        unitCost: Money.fromDecimal('1'),
      }),
    /purchase quantity.*safe integer/i,
  );
});

test('rejects a negative purchase unit cost', () => {
  assert.throws(
    () =>
      createPurchaseMovement({
        quantity: 1,
        unitCost: Money.fromDecimal('-0.000001'),
      }),
    /movement unit cost.*negative/i,
  );
});

test('creates an immutable movement', () => {
  const movement = createPurchaseMovement({
    quantity: 2,
    unitCost: Money.fromDecimal('4'),
  });

  assert.ok(Object.isFrozen(movement));
  assert.throws(() => Object.assign(movement, { quantityDelta: 9 }), TypeError);
});

test('does not mutate the Money input', () => {
  const unitCost = Money.fromDecimal('3.125');

  createPurchaseMovement({ quantity: 2, unitCost });

  assert.equal(unitCost.scaledUnits, 3_125_000);
});

test('supports an unknown cost on a generic movement', () => {
  const movement = createInventoryMovement({
    type: 'SALE',
    quantityDelta: -2,
    unitCost: null,
  });

  assert.equal(movement.unitCost, null);
});

test('rejects a zero quantity delta on a generic movement', () => {
  assert.throws(
    () =>
      createInventoryMovement({
        type: 'ADJUSTMENT_IN',
        quantityDelta: 0,
        unitCost: Money.zero(),
      }),
    /quantity delta.*non-zero/i,
  );
});

test('supports a negative quantity delta on a generic movement', () => {
  const movement = createInventoryMovement({
    type: 'ADJUSTMENT_OUT',
    quantityDelta: -3,
    unitCost: Money.fromDecimal('2'),
  });

  assert.equal(movement.quantityDelta, -3);
});

test('accepts safe integer quantity boundaries', () => {
  const purchase = createPurchaseMovement({
    quantity: Number.MAX_SAFE_INTEGER,
    unitCost: Money.zero(),
  });
  const outbound = createInventoryMovement({
    type: 'SALE',
    quantityDelta: Number.MIN_SAFE_INTEGER,
    unitCost: null,
  });

  assert.equal(purchase.quantityDelta, Number.MAX_SAFE_INTEGER);
  assert.equal(outbound.quantityDelta, Number.MIN_SAFE_INTEGER);
});

test('rejects an unsafe negative quantity delta', () => {
  assert.throws(
    () =>
      createInventoryMovement({
        type: 'SALE',
        quantityDelta: Number.MIN_SAFE_INTEGER - 1,
        unitCost: null,
      }),
    /quantity delta.*safe integer/i,
  );
});

test('represents exactly the initial Baseline movement types', () => {
  const movementTypes = [
    'INITIAL_STOCK',
    'PURCHASE',
    'SALE',
    'ADJUSTMENT_IN',
    'ADJUSTMENT_OUT',
    'REVERSAL',
  ] as const satisfies readonly InventoryMovementType[];

  const movements = movementTypes.map((type) =>
    createInventoryMovement({
      type,
      quantityDelta: 1,
      unitCost: null,
    }),
  );

  assert.deepEqual(
    movements.map(({ type }) => type),
    movementTypes,
  );
});
