import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateEstimatedProfit,
  calculateMargin,
  calculateMarkup,
  Money,
  Percentage,
} from '../src/index';

test('calculates positive estimated unit profit', () => {
  const result = calculateEstimatedProfit({
    salePrice: Money.fromDecimal('15'),
    estimatedUnitCost: Money.fromDecimal('10'),
  });

  assert.ok(result.equals(Money.fromDecimal('5')));
});

test('calculates zero estimated unit profit', () => {
  const result = calculateEstimatedProfit({
    salePrice: Money.fromDecimal('10'),
    estimatedUnitCost: Money.fromDecimal('10'),
  });

  assert.ok(result.equals(Money.zero()));
});

test('calculates negative estimated unit profit', () => {
  const result = calculateEstimatedProfit({
    salePrice: Money.fromDecimal('8'),
    estimatedUnitCost: Money.fromDecimal('10'),
  });

  assert.ok(result.equals(Money.fromDecimal('-2')));
});

test('calculates profit when estimated unit cost is zero', () => {
  const result = calculateEstimatedProfit({
    salePrice: Money.fromDecimal('15'),
    estimatedUnitCost: Money.zero(),
  });

  assert.ok(result.equals(Money.fromDecimal('15')));
});

test('rejects a negative sale price for estimated profit', () => {
  assert.throws(
    () =>
      calculateEstimatedProfit({
        salePrice: Money.fromDecimal('-1'),
        estimatedUnitCost: Money.zero(),
      }),
    /sale price.*negative/i,
  );
});

test('rejects a negative estimated unit cost for estimated profit', () => {
  assert.throws(
    () =>
      calculateEstimatedProfit({
        salePrice: Money.fromDecimal('1'),
        estimatedUnitCost: Money.fromDecimal('-1'),
      }),
    /estimated unit cost.*negative/i,
  );
});

test('calculates a 33.333333 percent margin', () => {
  const result = calculateMargin({
    salePrice: Money.fromDecimal('15'),
    estimatedUnitCost: Money.fromDecimal('10'),
  });

  assert.ok(result?.equals(Percentage.fromScaledUnits(33_333_333)));
});

test('calculates a zero margin when price equals cost', () => {
  const result = calculateMargin({
    salePrice: Money.fromDecimal('10'),
    estimatedUnitCost: Money.fromDecimal('10'),
  });

  assert.ok(result?.equals(Percentage.zero()));
});

test('calculates a negative margin for a sale below cost', () => {
  const result = calculateMargin({
    salePrice: Money.fromDecimal('8'),
    estimatedUnitCost: Money.fromDecimal('10'),
  });

  assert.ok(result?.equals(Percentage.fromScaledUnits(-25_000_000)));
});

test('calculates a 100 percent margin when cost is zero', () => {
  const result = calculateMargin({
    salePrice: Money.fromDecimal('15'),
    estimatedUnitCost: Money.zero(),
  });

  assert.ok(result?.equals(Percentage.fromScaledUnits(100_000_000)));
});

test('returns null margin when sale price is zero', () => {
  const result = calculateMargin({
    salePrice: Money.zero(),
    estimatedUnitCost: Money.fromDecimal('10'),
  });

  assert.equal(result, null);
});

test('rounds margin below half to the nearer percentage unit', () => {
  const result = calculateMargin({
    salePrice: Money.fromScaledUnits(300_000_000),
    estimatedUnitCost: Money.fromScaledUnits(299_999_999),
  });

  assert.equal(result?.scaledUnits, 0);
});

test('rounds margin above half to the nearer percentage unit', () => {
  const result = calculateMargin({
    salePrice: Money.fromScaledUnits(150_000_000),
    estimatedUnitCost: Money.fromScaledUnits(149_999_999),
  });

  assert.equal(result?.scaledUnits, 1);
});

test('rounds an exact-half margin away from zero', () => {
  const result = calculateMargin({
    salePrice: Money.fromScaledUnits(200_000_000),
    estimatedUnitCost: Money.fromScaledUnits(199_999_999),
  });

  assert.equal(result?.scaledUnits, 1);
});

test('calculates a 50 percent markup', () => {
  const result = calculateMarkup({
    salePrice: Money.fromDecimal('15'),
    estimatedUnitCost: Money.fromDecimal('10'),
  });

  assert.ok(result?.equals(Percentage.fromScaledUnits(50_000_000)));
});

test('calculates a 200 percent markup', () => {
  const result = calculateMarkup({
    salePrice: Money.fromDecimal('15'),
    estimatedUnitCost: Money.fromDecimal('5'),
  });

  assert.ok(result?.equals(Percentage.fromScaledUnits(200_000_000)));
});

test('calculates a negative markup for a sale below cost', () => {
  const result = calculateMarkup({
    salePrice: Money.fromDecimal('8'),
    estimatedUnitCost: Money.fromDecimal('10'),
  });

  assert.ok(result?.equals(Percentage.fromScaledUnits(-20_000_000)));
});

test('returns null markup when estimated unit cost is zero', () => {
  const result = calculateMarkup({
    salePrice: Money.fromDecimal('15'),
    estimatedUnitCost: Money.zero(),
  });

  assert.equal(result, null);
});

test('calculates zero markup when price equals cost', () => {
  const result = calculateMarkup({
    salePrice: Money.fromDecimal('10'),
    estimatedUnitCost: Money.fromDecimal('10'),
  });

  assert.ok(result?.equals(Percentage.zero()));
});

test('supports markup greater than 100 percent', () => {
  const result = calculateMarkup({
    salePrice: Money.fromDecimal('20'),
    estimatedUnitCost: Money.fromDecimal('5'),
  });

  assert.ok(result?.equals(Percentage.fromScaledUnits(300_000_000)));
});

test('calculates a large safe ratio without overflowing an intermediate product', () => {
  const result = calculateMargin({
    salePrice: Money.fromScaledUnits(Number.MAX_SAFE_INTEGER),
    estimatedUnitCost: Money.fromScaledUnits(1),
  });

  assert.ok(result?.equals(Percentage.fromScaledUnits(100_000_000)));
});

test('rejects percentage results outside the safe integer range', () => {
  assert.throws(
    () =>
      calculateMarkup({
        salePrice: Money.fromScaledUnits(Number.MAX_SAFE_INTEGER),
        estimatedUnitCost: Money.fromScaledUnits(1),
      }),
    /safe integer/i,
  );
});
