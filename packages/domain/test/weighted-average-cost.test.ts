import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateWeightedAverageCost, Money } from '../src/index';

test('uses purchase unit cost for the first purchase at zero stock', () => {
  const purchaseUnitCost = Money.fromDecimal('14');

  const result = calculateWeightedAverageCost({
    currentStock: 0,
    purchasedQuantity: 10,
    purchaseUnitCost,
  });

  assert.ok(result.equals(purchaseUnitCost));
});

test('preserves the average when the incoming cost is the same', () => {
  const result = calculateWeightedAverageCost({
    currentStock: 20,
    currentAverageCost: Money.fromDecimal('10'),
    purchasedQuantity: 10,
    purchaseUnitCost: Money.fromDecimal('10'),
  });

  assert.ok(result.equals(Money.fromDecimal('10')));
});

test('calculates a weighted average with a higher incoming cost', () => {
  const result = calculateWeightedAverageCost({
    currentStock: 10,
    currentAverageCost: Money.fromDecimal('10'),
    purchasedQuantity: 10,
    purchaseUnitCost: Money.fromDecimal('12'),
  });

  assert.ok(result.equals(Money.fromDecimal('11')));
});

test('calculates a weighted average with a lower incoming cost', () => {
  const result = calculateWeightedAverageCost({
    currentStock: 10,
    currentAverageCost: Money.fromDecimal('12'),
    purchasedQuantity: 10,
    purchaseUnitCost: Money.fromDecimal('10'),
  });

  assert.ok(result.equals(Money.fromDecimal('11')));
});

test('calculates 20 at 10 plus 10 at 12 as 10.666667', () => {
  const result = calculateWeightedAverageCost({
    currentStock: 20,
    currentAverageCost: Money.fromDecimal('10'),
    purchasedQuantity: 10,
    purchaseUnitCost: Money.fromDecimal('12'),
  });

  assert.ok(result.equals(Money.fromDecimal('10.666667')));
});

test('returns an exact scaled-unit division when possible', () => {
  const result = calculateWeightedAverageCost({
    currentStock: 2,
    currentAverageCost: Money.fromDecimal('10'),
    purchasedQuantity: 2,
    purchaseUnitCost: Money.fromDecimal('12'),
  });

  assert.ok(result.equals(Money.fromDecimal('11')));
});

test('rounds a weighted result below half toward zero', () => {
  const result = calculateWeightedAverageCost({
    currentStock: 2,
    currentAverageCost: Money.zero(),
    purchasedQuantity: 1,
    purchaseUnitCost: Money.fromScaledUnits(1),
  });

  assert.equal(result.scaledUnits, 0);
});

test('rounds a weighted result above half away from zero', () => {
  const result = calculateWeightedAverageCost({
    currentStock: 1,
    currentAverageCost: Money.zero(),
    purchasedQuantity: 2,
    purchaseUnitCost: Money.fromScaledUnits(1),
  });

  assert.equal(result.scaledUnits, 1);
});

test('rounds an exact-half weighted result away from zero', () => {
  const result = calculateWeightedAverageCost({
    currentStock: 1,
    currentAverageCost: Money.zero(),
    purchasedQuantity: 1,
    purchaseUnitCost: Money.fromScaledUnits(1),
  });

  assert.equal(result.scaledUnits, 1);
});

test('uses purchase cost when negative stock remains negative', () => {
  const purchaseUnitCost = Money.fromDecimal('12');

  const result = calculateWeightedAverageCost({
    currentStock: -5,
    purchasedQuantity: 2,
    purchaseUnitCost,
  });

  assert.ok(result.equals(purchaseUnitCost));
});

test('uses purchase cost when negative stock reaches zero', () => {
  const purchaseUnitCost = Money.fromDecimal('12');

  const result = calculateWeightedAverageCost({
    currentStock: -5,
    purchasedQuantity: 5,
    purchaseUnitCost,
  });

  assert.ok(result.equals(purchaseUnitCost));
});

test('uses purchase cost when negative stock becomes positive', () => {
  const purchaseUnitCost = Money.fromDecimal('14');

  const result = calculateWeightedAverageCost({
    currentStock: -3,
    purchasedQuantity: 10,
    purchaseUnitCost,
  });

  assert.ok(result.equals(purchaseUnitCost));
});

test('zero stock ignores a historical average cost', () => {
  const purchaseUnitCost = Money.fromDecimal('14');

  const result = calculateWeightedAverageCost({
    currentStock: 0,
    currentAverageCost: Money.fromDecimal('10'),
    purchasedQuantity: 10,
    purchaseUnitCost,
  });

  assert.ok(result.equals(purchaseUnitCost));
});

test('rejects a zero purchase quantity', () => {
  assert.throws(
    () =>
      calculateWeightedAverageCost({
        currentStock: 0,
        purchasedQuantity: 0,
        purchaseUnitCost: Money.fromDecimal('1'),
      }),
    /purchased quantity.*greater than zero/i,
  );
});

test('rejects a negative purchase quantity', () => {
  assert.throws(
    () =>
      calculateWeightedAverageCost({
        currentStock: 0,
        purchasedQuantity: -1,
        purchaseUnitCost: Money.fromDecimal('1'),
      }),
    /purchased quantity.*greater than zero/i,
  );
});

test('rejects a fractional purchase quantity', () => {
  assert.throws(
    () =>
      calculateWeightedAverageCost({
        currentStock: 0,
        purchasedQuantity: 1.5,
        purchaseUnitCost: Money.fromDecimal('1'),
      }),
    /purchased quantity.*safe integer/i,
  );
});

test('rejects an unsafe purchase quantity', () => {
  assert.throws(
    () =>
      calculateWeightedAverageCost({
        currentStock: 0,
        purchasedQuantity: Number.MAX_SAFE_INTEGER + 1,
        purchaseUnitCost: Money.fromDecimal('1'),
      }),
    /purchased quantity.*safe integer/i,
  );
});

test('rejects a missing average cost when current stock is positive', () => {
  assert.throws(
    () =>
      calculateWeightedAverageCost({
        currentStock: 1,
        purchasedQuantity: 1,
        purchaseUnitCost: Money.fromDecimal('1'),
      }),
    /current average cost.*required/i,
  );
});

test('rejects a negative purchase unit cost', () => {
  assert.throws(
    () =>
      calculateWeightedAverageCost({
        currentStock: 0,
        purchasedQuantity: 1,
        purchaseUnitCost: Money.fromDecimal('-1'),
      }),
    /purchase unit cost.*negative/i,
  );
});

test('rejects overflow in an intermediate inventory value', () => {
  assert.throws(
    () =>
      calculateWeightedAverageCost({
        currentStock: 2,
        currentAverageCost: Money.fromScaledUnits(Number.MAX_SAFE_INTEGER),
        purchasedQuantity: 1,
        purchaseUnitCost: Money.zero(),
      }),
    /safe integer/i,
  );
});

test('rejects a fractional current stock', () => {
  assert.throws(
    () =>
      calculateWeightedAverageCost({
        currentStock: 1.5,
        currentAverageCost: Money.fromDecimal('1'),
        purchasedQuantity: 1,
        purchaseUnitCost: Money.fromDecimal('1'),
      }),
    /current stock.*safe integer/i,
  );
});

test('rejects an unsafe current stock', () => {
  assert.throws(
    () =>
      calculateWeightedAverageCost({
        currentStock: Number.MAX_SAFE_INTEGER + 1,
        currentAverageCost: Money.fromDecimal('1'),
        purchasedQuantity: 1,
        purchaseUnitCost: Money.fromDecimal('1'),
      }),
    /current stock.*safe integer/i,
  );
});

test('rejects a negative average cost when current stock is positive', () => {
  assert.throws(
    () =>
      calculateWeightedAverageCost({
        currentStock: 1,
        currentAverageCost: Money.fromDecimal('-1'),
        purchasedQuantity: 1,
        purchaseUnitCost: Money.fromDecimal('1'),
      }),
    /current average cost.*negative/i,
  );
});

test('rejects overflow in the resulting stock quantity', () => {
  assert.throws(
    () =>
      calculateWeightedAverageCost({
        currentStock: Number.MAX_SAFE_INTEGER,
        currentAverageCost: Money.zero(),
        purchasedQuantity: 1,
        purchaseUnitCost: Money.zero(),
      }),
    /total quantity.*safe integer/i,
  );
});
