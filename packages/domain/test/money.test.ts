import assert from 'node:assert/strict';
import test from 'node:test';

import { Money } from '../src/index';

test('creates zero money', () => {
  assert.equal(Money.zero().scaledUnits, 0);
});

test('creates money from scaled units', () => {
  assert.equal(Money.fromScaledUnits(1_000_000).scaledUnits, 1_000_000);
});

test('creates money from an integer decimal', () => {
  assert.equal(Money.fromDecimal('1').scaledUnits, 1_000_000);
});

test('creates money from a decimal with one fractional digit', () => {
  assert.equal(Money.fromDecimal('1.5').scaledUnits, 1_500_000);
});

test('creates money from a decimal with two fractional digits', () => {
  assert.equal(Money.fromDecimal('10.67').scaledUnits, 10_670_000);
});

test('creates money from a decimal with exactly six fractional digits', () => {
  assert.equal(Money.fromDecimal('10.666666').scaledUnits, 10_666_666);
});

test('creates the minimum fractional unit', () => {
  assert.equal(Money.fromDecimal('0.000001').scaledUnits, 1);
});

test('creates negative money', () => {
  assert.equal(Money.fromDecimal('-2.50').scaledUnits, -2_500_000);
});

test('trims surrounding whitespace from decimal input', () => {
  assert.equal(Money.fromDecimal('  1.25  ').scaledUnits, 1_250_000);
});

test('accepts the maximum safe scaled value from decimal input', () => {
  assert.equal(
    Money.fromDecimal('9007199254.740991').scaledUnits,
    Number.MAX_SAFE_INTEGER,
  );
});

test('rejects an empty decimal string', () => {
  assert.throws(() => Money.fromDecimal(''), /decimal/i);
});

test('rejects alphabetic decimal input', () => {
  assert.throws(() => Money.fromDecimal('abc'), /decimal/i);
});

test('rejects more than six fractional digits', () => {
  assert.throws(() => Money.fromDecimal('1.2345678'), /decimal/i);
});

test('rejects scientific notation', () => {
  assert.throws(() => Money.fromDecimal('1e3'), /decimal/i);
});

test('rejects comma decimal notation', () => {
  assert.throws(() => Money.fromDecimal('1,25'), /decimal/i);
});

test('rejects textual Infinity', () => {
  assert.throws(() => Money.fromDecimal('Infinity'), /decimal/i);
});

test('rejects textual NaN', () => {
  assert.throws(() => Money.fromDecimal('NaN'), /decimal/i);
});

test('rejects decimal input outside the safe integer range', () => {
  assert.throws(() => Money.fromDecimal('9007199254.740992'), /safe integer/i);
});

test('fromScaledUnits rejects values that are not safe integers', () => {
  for (const value of [
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ]) {
    assert.throws(() => Money.fromScaledUnits(value), /safe integer/i);
  }
});

test('adds money values', () => {
  const result = Money.fromDecimal('1.25').add(Money.fromDecimal('2.50'));

  assert.equal(result.scaledUnits, 3_750_000);
});

test('subtracts money values', () => {
  const result = Money.fromDecimal('5.00').subtract(Money.fromDecimal('1.25'));

  assert.equal(result.scaledUnits, 3_750_000);
});

test('multiplies money by an integer', () => {
  const result = Money.fromDecimal('0.65').multiplyByInteger(24);

  assert.equal(result.scaledUnits, 15_600_000);
});

test('supports arithmetic with negative values', () => {
  const negative = Money.fromDecimal('-1.25');

  assert.equal(negative.add(Money.fromDecimal('0.25')).scaledUnits, -1_000_000);
  assert.equal(negative.multiplyByInteger(-2).scaledUnits, 2_500_000);
});

test('supports arithmetic that results in zero', () => {
  const value = Money.fromDecimal('3.50');

  assert.equal(value.subtract(value).scaledUnits, 0);
});

test('arithmetic does not mutate its operands', () => {
  const left = Money.fromDecimal('1.25');
  const right = Money.fromDecimal('2.50');
  const result = left.add(right);

  assert.equal(left.scaledUnits, 1_250_000);
  assert.equal(right.scaledUnits, 2_500_000);
  assert.equal(result.scaledUnits, 3_750_000);
  assert.notStrictEqual(result, left);
  assert.notStrictEqual(result, right);
});

test('adds 0.1 and 0.2 exactly as 0.3', () => {
  const result = Money.fromDecimal('0.1').add(Money.fromDecimal('0.2'));

  assert.ok(result.equals(Money.fromDecimal('0.3')));
  assert.equal(result.scaledUnits, 300_000);
});

test('multiplyByInteger rejects multipliers that are not safe integers', () => {
  const value = Money.fromDecimal('1');

  for (const multiplier of [1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN]) {
    assert.throws(() => value.multiplyByInteger(multiplier), /safe integer/i);
  }
});

test('rejects overflow in addition', () => {
  const maximum = Money.fromScaledUnits(Number.MAX_SAFE_INTEGER);

  assert.throws(() => maximum.add(Money.fromScaledUnits(1)), /safe integer/i);
});

test('rejects overflow in subtraction', () => {
  const minimum = Money.fromScaledUnits(Number.MIN_SAFE_INTEGER);

  assert.throws(
    () => minimum.subtract(Money.fromScaledUnits(1)),
    /safe integer/i,
  );
});

test('rejects overflow in multiplication', () => {
  const value = Money.fromScaledUnits(Number.MAX_SAFE_INTEGER);

  assert.throws(() => value.multiplyByInteger(2), /safe integer/i);
});

test('compares and checks equality exactly', () => {
  const lower = Money.fromDecimal('-1');
  const equal = Money.fromDecimal('0');
  const greater = Money.fromDecimal('1');

  assert.equal(lower.compare(equal), -1);
  assert.equal(equal.compare(Money.zero()), 0);
  assert.equal(greater.compare(equal), 1);
  assert.ok(equal.equals(Money.zero()));
  assert.equal(equal.equals(greater), false);
});

test('divides money exactly by an integer', () => {
  const result = Money.fromScaledUnits(12).divideByInteger(3);

  assert.equal(result.scaledUnits, 4);
});

test('rounds integer division below half toward zero', () => {
  const result = Money.fromScaledUnits(4).divideByInteger(3);

  assert.equal(result.scaledUnits, 1);
});

test('rounds integer division above half away from zero', () => {
  const result = Money.fromScaledUnits(5).divideByInteger(3);

  assert.equal(result.scaledUnits, 2);
});

test('rounds a positive exact half away from zero', () => {
  const result = Money.fromScaledUnits(1).divideByInteger(2);

  assert.equal(result.scaledUnits, 1);
});

test('rounds a negative exact half away from zero', () => {
  const result = Money.fromScaledUnits(-1).divideByInteger(2);

  assert.equal(result.scaledUnits, -1);
});

test('defines division behavior for a negative divisor', () => {
  const result = Money.fromScaledUnits(1).divideByInteger(-2);

  assert.equal(result.scaledUnits, -1);
});

test('divideByInteger rejects zero and values that are not safe integers', () => {
  const value = Money.fromScaledUnits(1);

  for (const divisor of [0, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN]) {
    assert.throws(() => value.divideByInteger(divisor), /divisor/i);
  }
});
