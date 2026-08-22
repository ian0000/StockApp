import assert from 'node:assert/strict';
import test from 'node:test';

import { Money } from '@stock-app/domain';

import {
  formatAverageCostTransition,
  formatStockTransition,
  parsePurchaseFormValues,
} from '../src/ui/purchases/purchase-form';

test('parses a positive safe integer quantity', () => {
  const result = parsePurchaseFormValues({
    quantity: '5',
    unitCost: '2',
  });

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.quantity, 5);
});

test('rejects missing, zero, negative, fractional and unsafe quantities', () => {
  for (const quantity of ['', '0', '-1', '1.5', 'abc', '9007199254740992']) {
    const result = parsePurchaseFormValues({ quantity, unitCost: '2' });

    assert.equal(result.ok, false, quantity);
    if (!result.ok) assert.notEqual(result.quantityError, null, quantity);
  }
});

test('reuses comma, dot and leading-separator money normalization', () => {
  for (const [unitCost, expectedUnits] of [
    ['0,5', 500_000],
    [',5', 500_000],
    ['0.5', 500_000],
    ['.5', 500_000],
    ['1,25', 1_250_000],
  ] as const) {
    const result = parsePurchaseFormValues({ quantity: '1', unitCost });

    assert.equal(result.ok, true, unitCost);
    if (result.ok) assert.equal(result.unitCost.scaledUnits, expectedUnits);
  }
});

test('accepts a known zero purchase cost', () => {
  for (const unitCost of ['0', '0.00', '0,00']) {
    const result = parsePurchaseFormValues({ quantity: '2', unitCost });

    assert.equal(result.ok, true, unitCost);
    if (result.ok) assert.equal(result.unitCost.scaledUnits, 0);
  }
});

test('rejects missing, negative, ambiguous and over-precision costs', () => {
  for (const unitCost of ['', '-1', '1,2.3', '1.2.3', 'abc', '0,1234567']) {
    const result = parsePurchaseFormValues({ quantity: '1', unitCost });

    assert.equal(result.ok, false, unitCost);
    if (!result.ok) assert.notEqual(result.unitCostError, null, unitCost);
  }
});

test('calculates purchase total with exact Money arithmetic', () => {
  const result = parsePurchaseFormValues({
    quantity: '3',
    unitCost: '0,123456',
  });

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.total.scaledUnits, 370_368);
});

test('rejects a purchase preview whose exact total would overflow Money', () => {
  const result = parsePurchaseFormValues({
    quantity: '9007199254',
    unitCost: '1000000',
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.notEqual(result.unitCostError, null);
});

test('formats unknown previous average cost without substituting zero', () => {
  assert.equal(
    formatAverageCostTransition(null, Money.fromDecimal('2'), 'USD'),
    '— → USD 2.00',
  );
});

test('formats known zero previous average cost as real zero', () => {
  assert.equal(
    formatAverageCostTransition(Money.zero(), Money.fromDecimal('2'), 'USD'),
    'USD 0.00 → USD 2.00',
  );
});

test('formats positive and negative stock transitions', () => {
  assert.equal(formatStockTransition(20, 30), '20 → 30');
  assert.equal(formatStockTransition(-10, -6), '-10 → -6');
  assert.equal(formatStockTransition(-10, 5), '-10 → 5');
});
