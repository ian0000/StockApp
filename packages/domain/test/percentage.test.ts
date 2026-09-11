import assert from 'node:assert/strict';
import test from 'node:test';

import { Percentage } from '../src/index';

for (const [text, units] of [
  ['0', 0],
  ['30', 30_000_000],
  ['33.333333', 33_333_333],
  [' 0.5 ', 500_000],
  ['-2.5', -2_500_000],
  ['100', 100_000_000],
  ['9007199254.740991', Number.MAX_SAFE_INTEGER],
] as const) {
  test(`parses Percentage decimal exactly: ${text}`, () => {
    assert.equal(Percentage.fromDecimal(text).scaledUnits, units);
  });
}
for (const text of [
  '',
  'abc',
  '1e2',
  '1,5',
  '.5',
  '1.1234567',
  '9007199254.740992',
]) {
  test(`rejects invalid Percentage decimal: ${text}`, () => {
    assert.throws(() => Percentage.fromDecimal(text), /decimal|safe integer/i);
  });
}

test('creates a zero percentage', () => {
  assert.equal(Percentage.zero().scaledUnits, 0);
});

test('stores exact internal percentage units', () => {
  assert.equal(Percentage.fromScaledUnits(33_333_333).scaledUnits, 33_333_333);
});

test('supports negative percentage values', () => {
  assert.equal(
    Percentage.fromScaledUnits(-20_500_000).scaledUnits,
    -20_500_000,
  );
});

test('is immutable', () => {
  const percentage = Percentage.fromScaledUnits(50_000_000);

  assert.ok(Object.isFrozen(percentage));
  assert.equal(percentage.scaledUnits, 50_000_000);
});

test('checks equality exactly', () => {
  const percentage = Percentage.fromScaledUnits(50_000_000);

  assert.ok(percentage.equals(Percentage.fromScaledUnits(50_000_000)));
  assert.equal(
    percentage.equals(Percentage.fromScaledUnits(50_000_001)),
    false,
  );
});

test('compares lower, equal and greater values', () => {
  const lower = Percentage.fromScaledUnits(-1);
  const equal = Percentage.zero();
  const greater = Percentage.fromScaledUnits(1);

  assert.equal(lower.compare(equal), -1);
  assert.equal(equal.compare(Percentage.zero()), 0);
  assert.equal(greater.compare(equal), 1);
});

test('rejects values that are not safe integers', () => {
  for (const value of [
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ]) {
    assert.throws(() => Percentage.fromScaledUnits(value), /safe integer/i);
  }
});
