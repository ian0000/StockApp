import assert from 'node:assert/strict';
import test from 'node:test';

import { applyPurchase, createInventoryState, Money } from '../src/index';

test('applies a first purchase to zero stock with unknown cost', () => {
  const result = applyPurchase({
    inventory: createInventoryState({ stock: 0, unitCost: null }),
    quantity: 5,
    unitCost: Money.fromDecimal('8'),
  });

  assert.equal(result.stock, 5);
  assert.ok(result.unitCost?.equals(Money.fromDecimal('8')));
});

test('zero stock ignores its historical unit cost', () => {
  const result = applyPurchase({
    inventory: createInventoryState({
      stock: 0,
      unitCost: Money.fromDecimal('10'),
    }),
    quantity: 10,
    unitCost: Money.fromDecimal('14'),
  });

  assert.equal(result.stock, 10);
  assert.ok(result.unitCost?.equals(Money.fromDecimal('14')));
});

test('positive stock preserves the average for the same incoming cost', () => {
  const result = applyPurchase({
    inventory: createInventoryState({
      stock: 20,
      unitCost: Money.fromDecimal('10'),
    }),
    quantity: 10,
    unitCost: Money.fromDecimal('10'),
  });

  assert.equal(result.stock, 30);
  assert.ok(result.unitCost?.equals(Money.fromDecimal('10')));
});

test('positive stock calculates an average with a higher incoming cost', () => {
  const result = applyPurchase({
    inventory: createInventoryState({
      stock: 10,
      unitCost: Money.fromDecimal('10'),
    }),
    quantity: 10,
    unitCost: Money.fromDecimal('12'),
  });

  assert.equal(result.stock, 20);
  assert.ok(result.unitCost?.equals(Money.fromDecimal('11')));
});

test('positive stock calculates an average with a lower incoming cost', () => {
  const result = applyPurchase({
    inventory: createInventoryState({
      stock: 10,
      unitCost: Money.fromDecimal('12'),
    }),
    quantity: 10,
    unitCost: Money.fromDecimal('10'),
  });

  assert.equal(result.stock, 20);
  assert.ok(result.unitCost?.equals(Money.fromDecimal('11')));
});

test('applies 20 at $10 plus 10 at $12 as stock 30 at $10.666667', () => {
  const result = applyPurchase({
    inventory: createInventoryState({
      stock: 20,
      unitCost: Money.fromDecimal('10'),
    }),
    quantity: 10,
    unitCost: Money.fromDecimal('12'),
  });

  assert.equal(result.stock, 30);
  assert.ok(result.unitCost?.equals(Money.fromDecimal('10.666667')));
});

test('a purchase that leaves stock negative establishes its unit cost', () => {
  const result = applyPurchase({
    inventory: createInventoryState({
      stock: -5,
      unitCost: Money.fromDecimal('10'),
    }),
    quantity: 2,
    unitCost: Money.fromDecimal('12'),
  });

  assert.equal(result.stock, -3);
  assert.ok(result.unitCost?.equals(Money.fromDecimal('12')));
});

test('a purchase that reaches zero establishes its unit cost', () => {
  const result = applyPurchase({
    inventory: createInventoryState({ stock: -5, unitCost: null }),
    quantity: 5,
    unitCost: Money.fromDecimal('12'),
  });

  assert.equal(result.stock, 0);
  assert.ok(result.unitCost?.equals(Money.fromDecimal('12')));
});

test('a purchase that crosses negative stock uses only its unit cost', () => {
  const result = applyPurchase({
    inventory: createInventoryState({
      stock: -3,
      unitCost: Money.fromDecimal('10'),
    }),
    quantity: 10,
    unitCost: Money.fromDecimal('14'),
  });

  assert.equal(result.stock, 7);
  assert.ok(result.unitCost?.equals(Money.fromDecimal('14')));
});

test('negative stock with unknown previous cost accepts the first known cost', () => {
  const result = applyPurchase({
    inventory: createInventoryState({ stock: -2, unitCost: null }),
    quantity: 1,
    unitCost: Money.fromDecimal('8'),
  });

  assert.equal(result.stock, -1);
  assert.ok(result.unitCost?.equals(Money.fromDecimal('8')));
});

test('rejects a zero purchase quantity', () => {
  assert.throws(
    () =>
      applyPurchase({
        inventory: createInventoryState({ stock: 0, unitCost: null }),
        quantity: 0,
        unitCost: Money.fromDecimal('1'),
      }),
    /purchased quantity.*greater than zero/i,
  );
});

test('rejects a negative purchase quantity', () => {
  assert.throws(
    () =>
      applyPurchase({
        inventory: createInventoryState({ stock: 0, unitCost: null }),
        quantity: -1,
        unitCost: Money.fromDecimal('1'),
      }),
    /purchased quantity.*greater than zero/i,
  );
});

test('rejects a fractional purchase quantity', () => {
  assert.throws(
    () =>
      applyPurchase({
        inventory: createInventoryState({ stock: 0, unitCost: null }),
        quantity: 1.5,
        unitCost: Money.fromDecimal('1'),
      }),
    /purchased quantity.*safe integer/i,
  );
});

test('rejects an unsafe purchase quantity', () => {
  assert.throws(
    () =>
      applyPurchase({
        inventory: createInventoryState({ stock: 0, unitCost: null }),
        quantity: Number.MAX_SAFE_INTEGER + 1,
        unitCost: Money.fromDecimal('1'),
      }),
    /purchased quantity.*safe integer/i,
  );
});

test('rejects a negative purchase unit cost', () => {
  assert.throws(
    () =>
      applyPurchase({
        inventory: createInventoryState({ stock: 0, unitCost: null }),
        quantity: 1,
        unitCost: Money.fromDecimal('-1'),
      }),
    /purchase unit cost.*negative/i,
  );
});

test('rejects positive inventory without a unit cost', () => {
  assert.throws(
    () =>
      applyPurchase({
        inventory: { stock: 5, unitCost: null },
        quantity: 1,
        unitCost: Money.fromDecimal('1'),
      }),
    /inventory unit cost.*required/i,
  );
});

test('rejects a negative stored unit cost', () => {
  assert.throws(
    () =>
      applyPurchase({
        inventory: {
          stock: -1,
          unitCost: Money.fromDecimal('-1'),
        },
        quantity: 1,
        unitCost: Money.fromDecimal('1'),
      }),
    /inventory unit cost.*negative/i,
  );
});

test('rejects overflow in resulting stock', () => {
  assert.throws(
    () =>
      applyPurchase({
        inventory: createInventoryState({
          stock: Number.MAX_SAFE_INTEGER,
          unitCost: Money.zero(),
        }),
        quantity: 1,
        unitCost: Money.zero(),
      }),
    /safe integer/i,
  );
});

test('does not mutate the original inventory state', () => {
  const inventory = createInventoryState({
    stock: 20,
    unitCost: Money.fromDecimal('10'),
  });

  const result = applyPurchase({
    inventory,
    quantity: 10,
    unitCost: Money.fromDecimal('12'),
  });

  assert.equal(inventory.stock, 20);
  assert.ok(inventory.unitCost?.equals(Money.fromDecimal('10')));
  assert.notStrictEqual(result, inventory);
});

test('does not mutate Money inputs', () => {
  const currentUnitCost = Money.fromDecimal('10');
  const purchaseUnitCost = Money.fromDecimal('12');

  applyPurchase({
    inventory: createInventoryState({
      stock: 20,
      unitCost: currentUnitCost,
    }),
    quantity: 10,
    unitCost: purchaseUnitCost,
  });

  assert.equal(currentUnitCost.scaledUnits, 10_000_000);
  assert.equal(purchaseUnitCost.scaledUnits, 12_000_000);
});

test('rejects fractional inventory stock', () => {
  assert.throws(
    () => createInventoryState({ stock: 1.5, unitCost: Money.zero() }),
    /inventory stock.*safe integer/i,
  );
});

test('rejects unsafe inventory stock', () => {
  assert.throws(
    () =>
      createInventoryState({
        stock: Number.MAX_SAFE_INTEGER + 1,
        unitCost: Money.zero(),
      }),
    /inventory stock.*safe integer/i,
  );
});

test('creates an immutable inventory state', () => {
  const inventory = createInventoryState({ stock: 0, unitCost: null });

  assert.ok(Object.isFrozen(inventory));
});
