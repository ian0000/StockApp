import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInitialInventory,
  createInitialStockMovement,
  Money,
} from '../src/index';

test('creates zero initial stock with unknown cost', () => {
  const result = createInitialInventory({
    initialStock: 0,
    initialUnitCost: null,
  });

  assert.equal(result.inventory.stock, 0);
  assert.equal(result.inventory.unitCost, null);
});

test('returns no movement for zero initial stock', () => {
  const result = createInitialInventory({
    initialStock: 0,
    initialUnitCost: null,
  });

  assert.equal(result.movement, null);
});

test('rejects a known cost with zero initial stock', () => {
  assert.throws(
    () =>
      createInitialInventory({
        initialStock: 0,
        initialUnitCost: Money.fromDecimal('1'),
      }),
    /initial unit cost.*stock is zero/i,
  );
});

test('creates positive initial stock with a known cost', () => {
  const result = createInitialInventory({
    initialStock: 20,
    initialUnitCost: Money.fromDecimal('10'),
  });

  assert.equal(result.inventory.stock, 20);
  assert.ok(result.inventory.unitCost?.equals(Money.fromDecimal('10')));
});

test('creates an INITIAL_STOCK movement for positive stock', () => {
  const result = createInitialInventory({
    initialStock: 20,
    initialUnitCost: Money.fromDecimal('10'),
  });

  assert.equal(result.movement?.type, 'INITIAL_STOCK');
});

test('uses initial stock as the movement quantity delta', () => {
  const result = createInitialInventory({
    initialStock: 20,
    initialUnitCost: Money.fromDecimal('10'),
  });

  assert.equal(result.movement?.quantityDelta, 20);
});

test('preserves the exact cost on the initial stock movement', () => {
  const initialUnitCost = Money.fromDecimal('10.666667');
  const result = createInitialInventory({
    initialStock: 20,
    initialUnitCost,
  });

  assert.strictEqual(result.movement?.unitCostSnapshot, initialUnitCost);
});

test('preserves the exact cost on the inventory state', () => {
  const initialUnitCost = Money.fromDecimal('10.666667');
  const result = createInitialInventory({
    initialStock: 20,
    initialUnitCost,
  });

  assert.strictEqual(result.inventory.unitCost, initialUnitCost);
});

test('accepts a real zero cost with positive initial stock', () => {
  const result = createInitialInventory({
    initialStock: 5,
    initialUnitCost: Money.zero(),
  });

  assert.ok(result.inventory.unitCost?.equals(Money.zero()));
  assert.ok(result.movement?.unitCostSnapshot?.equals(Money.zero()));
});

test('rejects an unknown cost with positive initial stock', () => {
  assert.throws(
    () =>
      createInitialInventory({
        initialStock: 1,
        initialUnitCost: null,
      }),
    /initial unit cost.*required.*positive/i,
  );
});

test('rejects negative initial stock', () => {
  assert.throws(
    () =>
      createInitialInventory({
        initialStock: -1,
        initialUnitCost: Money.fromDecimal('1'),
      }),
    /initial stock.*negative/i,
  );
});

test('rejects fractional initial stock', () => {
  assert.throws(
    () =>
      createInitialInventory({
        initialStock: 1.5,
        initialUnitCost: Money.fromDecimal('1'),
      }),
    /initial stock.*safe integer/i,
  );
});

test('rejects unsafe initial stock', () => {
  assert.throws(
    () =>
      createInitialInventory({
        initialStock: Number.MAX_SAFE_INTEGER + 1,
        initialUnitCost: Money.fromDecimal('1'),
      }),
    /initial stock.*safe integer/i,
  );
});

test('rejects a negative initial cost', () => {
  assert.throws(
    () =>
      createInitialInventory({
        initialStock: 1,
        initialUnitCost: Money.fromDecimal('-0.000001'),
      }),
    /unit cost.*negative/i,
  );
});

test('accepts the minimum positive initial stock of one', () => {
  const result = createInitialInventory({
    initialStock: 1,
    initialUnitCost: Money.fromDecimal('2'),
  });

  assert.equal(result.inventory.stock, 1);
  assert.equal(result.movement?.quantityDelta, 1);
});

test('accepts the largest safe initial stock', () => {
  const result = createInitialInventory({
    initialStock: Number.MAX_SAFE_INTEGER,
    initialUnitCost: Money.zero(),
  });

  assert.equal(result.inventory.stock, Number.MAX_SAFE_INTEGER);
  assert.equal(result.movement?.quantityDelta, Number.MAX_SAFE_INTEGER);
});

test('initial stock movement factory rejects zero quantity', () => {
  assert.throws(
    () =>
      createInitialStockMovement({
        quantity: 0,
        unitCost: Money.fromDecimal('1'),
      }),
    /initial stock quantity.*greater than zero/i,
  );
});

test('initial stock movement factory rejects negative quantity', () => {
  assert.throws(
    () =>
      createInitialStockMovement({
        quantity: -1,
        unitCost: Money.fromDecimal('1'),
      }),
    /initial stock quantity.*greater than zero/i,
  );
});

test('initial stock movement factory rejects fractional quantity', () => {
  assert.throws(
    () =>
      createInitialStockMovement({
        quantity: 1.5,
        unitCost: Money.fromDecimal('1'),
      }),
    /initial stock quantity.*safe integer/i,
  );
});

test('initial stock movement factory rejects unsafe quantity', () => {
  assert.throws(
    () =>
      createInitialStockMovement({
        quantity: Number.MAX_SAFE_INTEGER + 1,
        unitCost: Money.fromDecimal('1'),
      }),
    /initial stock quantity.*safe integer/i,
  );
});

test('initial stock movement factory rejects negative cost', () => {
  assert.throws(
    () =>
      createInitialStockMovement({
        quantity: 1,
        unitCost: Money.fromDecimal('-1'),
      }),
    /movement cost snapshot.*negative/i,
  );
});

test('does not mutate the Money input', () => {
  const initialUnitCost = Money.fromDecimal('3.125');

  createInitialInventory({ initialStock: 2, initialUnitCost });

  assert.equal(initialUnitCost.scaledUnits, 3_125_000);
});

test('creates an immutable result and immutable nested values', () => {
  const result = createInitialInventory({
    initialStock: 2,
    initialUnitCost: Money.fromDecimal('3'),
  });

  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.inventory));
  assert.ok(Object.isFrozen(result.movement));
  assert.throws(() => Object.assign(result, { movement: null }), TypeError);
});

test('does not create a purchase movement', () => {
  const result = createInitialInventory({
    initialStock: 2,
    initialUnitCost: Money.fromDecimal('3'),
  });

  assert.notEqual(result.movement?.type, 'PURCHASE');
  assert.equal(result.movement?.type, 'INITIAL_STOCK');
});

test('zero-stock result contains no synthetic movement or cost', () => {
  const result = createInitialInventory({
    initialStock: 0,
    initialUnitCost: null,
  });

  assert.deepEqual(result, {
    inventory: { stock: 0, unitCost: null },
    movement: null,
  });
});
