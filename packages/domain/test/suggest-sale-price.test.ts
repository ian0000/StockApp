import assert from 'node:assert/strict';
import test from 'node:test';

import { Money, Percentage, suggestSalePriceForMargin } from '../src/index';

test('suggests approximately $18 for $12 at a 33.333333 percent margin', () => {
  const result = suggestSalePriceForMargin({
    unitCost: Money.fromDecimal('12'),
    targetMargin: Percentage.fromScaledUnits(33_333_333),
  });

  assert.ok(result?.equals(Money.fromDecimal('18')));
});

test('suggests $20 for $10 at a 50 percent margin', () => {
  const result = suggestSalePriceForMargin({
    unitCost: Money.fromDecimal('10'),
    targetMargin: Percentage.fromScaledUnits(50_000_000),
  });

  assert.ok(result?.equals(Money.fromDecimal('20')));
});

test('suggests cost itself for a zero margin', () => {
  const result = suggestSalePriceForMargin({
    unitCost: Money.fromDecimal('10'),
    targetMargin: Percentage.zero(),
  });

  assert.ok(result?.equals(Money.fromDecimal('10')));
});

test('suggests $8 for $10 at a negative 25 percent margin', () => {
  const result = suggestSalePriceForMargin({
    unitCost: Money.fromDecimal('10'),
    targetMargin: Percentage.fromScaledUnits(-25_000_000),
  });

  assert.ok(result?.equals(Money.fromDecimal('8')));
});

test('suggests $40 for $10 at a 75 percent margin', () => {
  const result = suggestSalePriceForMargin({
    unitCost: Money.fromDecimal('10'),
    targetMargin: Percentage.fromScaledUnits(75_000_000),
  });

  assert.ok(result?.equals(Money.fromDecimal('40')));
});

test('rounds a result below half to the nearer Money unit', () => {
  const result = suggestSalePriceForMargin({
    unitCost: Money.fromScaledUnits(3),
    targetMargin: Percentage.fromScaledUnits(-100_000_001),
  });

  assert.equal(result?.scaledUnits, 1);
});

test('rounds a result above half to the nearer Money unit', () => {
  const result = suggestSalePriceForMargin({
    unitCost: Money.fromScaledUnits(3),
    targetMargin: Percentage.fromScaledUnits(-99_999_999),
  });

  assert.equal(result?.scaledUnits, 2);
});

test('rounds an exact-half result away from zero', () => {
  const result = suggestSalePriceForMargin({
    unitCost: Money.fromScaledUnits(3),
    targetMargin: Percentage.fromScaledUnits(-100_000_000),
  });

  assert.equal(result?.scaledUnits, 2);
});

test('uses all six decimal places of the target margin', () => {
  const result = suggestSalePriceForMargin({
    unitCost: Money.fromDecimal('100'),
    targetMargin: Percentage.fromScaledUnits(33_333_333),
  });

  assert.ok(result?.equals(Money.fromDecimal('149.999999')));
});

test('preserves a six-decimal unit cost in the calculation', () => {
  const result = suggestSalePriceForMargin({
    unitCost: Money.fromDecimal('1.234567'),
    targetMargin: Percentage.fromScaledUnits(50_000_000),
  });

  assert.ok(result?.equals(Money.fromDecimal('2.469134')));
});

test('returns a finite representable price for a margin just below 100 percent', () => {
  const result = suggestSalePriceForMargin({
    unitCost: Money.fromScaledUnits(1),
    targetMargin: Percentage.fromScaledUnits(99_999_999),
  });

  assert.equal(result?.scaledUnits, 100_000_000);
});

test('returns null for a target margin of exactly 100 percent', () => {
  const result = suggestSalePriceForMargin({
    unitCost: Money.fromDecimal('10'),
    targetMargin: Percentage.fromScaledUnits(100_000_000),
  });

  assert.equal(result, null);
});

test('returns null for a target margin above 100 percent', () => {
  const result = suggestSalePriceForMargin({
    unitCost: Money.fromDecimal('10'),
    targetMargin: Percentage.fromScaledUnits(100_000_001),
  });

  assert.equal(result, null);
});

test('supports a very negative margin when the price is representable', () => {
  const result = suggestSalePriceForMargin({
    unitCost: Money.fromDecimal('10'),
    targetMargin: Percentage.fromScaledUnits(-900_000_000),
  });

  assert.ok(result?.equals(Money.fromDecimal('1')));
});

test('returns null when unit cost is zero', () => {
  const result = suggestSalePriceForMargin({
    unitCost: Money.zero(),
    targetMargin: Percentage.fromScaledUnits(50_000_000),
  });

  assert.equal(result, null);
});

test('rejects a negative unit cost', () => {
  assert.throws(
    () =>
      suggestSalePriceForMargin({
        unitCost: Money.fromDecimal('-0.000001'),
        targetMargin: Percentage.fromScaledUnits(50_000_000),
      }),
    /unit cost.*negative/i,
  );
});

test('supports the smallest positive unit cost', () => {
  const result = suggestSalePriceForMargin({
    unitCost: Money.fromScaledUnits(1),
    targetMargin: Percentage.fromScaledUnits(50_000_000),
  });

  assert.equal(result?.scaledUnits, 2);
});

test('fails explicitly when the suggested price exceeds Money range', () => {
  assert.throws(
    () =>
      suggestSalePriceForMargin({
        unitCost: Money.fromScaledUnits(Number.MAX_SAFE_INTEGER),
        targetMargin: Percentage.fromScaledUnits(50_000_000),
      }),
    RangeError,
  );
});

test('avoids overflow in an intermediate multiplication', () => {
  const result = suggestSalePriceForMargin({
    unitCost: Money.fromScaledUnits(4_000_000_000_000_000),
    targetMargin: Percentage.fromScaledUnits(50_000_000),
  });

  assert.equal(result?.scaledUnits, 8_000_000_000_000_000);
});

test('does not mutate input value objects', () => {
  const unitCost = Money.fromDecimal('12');
  const targetMargin = Percentage.fromScaledUnits(33_333_333);

  suggestSalePriceForMargin({ unitCost, targetMargin });

  assert.ok(Object.isFrozen(unitCost));
  assert.ok(Object.isFrozen(targetMargin));
  assert.equal(unitCost.scaledUnits, 12_000_000);
  assert.equal(targetMargin.scaledUnits, 33_333_333);
});
