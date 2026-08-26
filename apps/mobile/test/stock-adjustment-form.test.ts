import assert from 'node:assert/strict';
import test from 'node:test';

import { Money } from '@stock-app/domain';

import {
  deriveAdjustmentDifference,
  evaluateAdjustmentForm,
  formatSignedDifference,
  getAdjustmentReasonOptions,
  getDefaultAdjustmentCostMode,
  normalizeReasonForDifference,
  parseActualStock,
  parseAdjustmentUnitCost,
} from '../src/ui/adjustments/stock-adjustment-form';

test('physical stock accepts zero and positive safe integers', () => {
  assert.deepEqual(parseActualStock('0'), { ok: true, value: 0 });
  assert.deepEqual(parseActualStock('15'), { ok: true, value: 15 });
});

for (const value of ['-1', '1.5', 'abc', String(Number.MAX_SAFE_INTEGER + 1)]) {
  test(`physical stock rejects ${value}`, () => {
    assert.equal(parseActualStock(value).ok, false);
  });
}

test('derives positive, negative and zero differences', () => {
  assert.equal(deriveAdjustmentDifference(10, 15), 5);
  assert.equal(deriveAdjustmentDifference(10, 7), -3);
  assert.equal(deriveAdjustmentDifference(10, 10), 0);
});

test('formats signed differences', () => {
  assert.equal(formatSignedDifference(5), '+5');
  assert.equal(formatSignedDifference(-3), '-3');
  assert.equal(formatSignedDifference(0), '0');
});

test('positive adjustments expose only count correction and other', () => {
  assert.deepEqual(
    getAdjustmentReasonOptions(2).map(({ value }) => value),
    ['COUNT_CORRECTION', 'OTHER'],
  );
});

test('negative adjustments expose every approved reason', () => {
  assert.deepEqual(
    getAdjustmentReasonOptions(-2).map(({ value }) => value),
    ['COUNT_CORRECTION', 'DAMAGED', 'LOST', 'INTERNAL_USE', 'OTHER'],
  );
});

test('invalid selected reason resets when direction becomes positive', () => {
  assert.equal(normalizeReasonForDifference('DAMAGED', 2), 'COUNT_CORRECTION');
  assert.equal(normalizeReasonForDifference('DAMAGED', -2), 'DAMAGED');
});

test('known current cost defaults to USE_CURRENT_COST', () => {
  assert.equal(
    getDefaultAdjustmentCostMode(Money.fromDecimal('2')),
    'USE_CURRENT_COST',
  );
});

test('known zero cost is treated as known', () => {
  assert.equal(getDefaultAdjustmentCostMode(Money.zero()), 'USE_CURRENT_COST');
});

test('unknown current cost requires CUSTOM_COST', () => {
  assert.equal(getDefaultAdjustmentCostMode(null), 'CUSTOM_COST');
});

test('custom cost accepts comma, dot, leading separators and zero', () => {
  for (const value of ['0,5', '0.5', ',5', '.5']) {
    assert.equal(parseAdjustmentUnitCost(value)?.scaledUnits, 500_000);
  }
  assert.equal(parseAdjustmentUnitCost('0')?.scaledUnits, 0);
});

test('custom cost rejects negatives, ambiguity, excess precision and overflow', () => {
  for (const value of ['-1', '1,2.3', '0.1234567', '999999999999999999999']) {
    assert.equal(parseAdjustmentUnitCost(value), null);
  }
});

function evaluation(
  overrides: Partial<Parameters<typeof evaluateAdjustmentForm>[0]> = {},
) {
  return evaluateAdjustmentForm({
    hasSelectedProduct: true,
    currentStock: 10,
    currentUnitCost: Money.fromDecimal('2'),
    actualStockText: '15',
    reason: 'COUNT_CORRECTION',
    costMode: 'USE_CURRENT_COST',
    customUnitCostText: '',
    isSubmitting: false,
    canPersist: true,
    ...overrides,
  });
}

test('CTA eligibility requires a complete valid positive adjustment', () => {
  assert.equal(evaluation().canSubmit, true);
  assert.equal(
    evaluation({ costMode: 'CUSTOM_COST', customUnitCostText: '' }).canSubmit,
    false,
  );
  assert.equal(
    evaluation({
      costMode: 'CUSTOM_COST',
      customUnitCostText: '0,5',
    }).canSubmit,
    true,
  );
});

test('CTA is disabled for no product, no-op, invalid reason, submitting or web', () => {
  assert.equal(evaluation({ hasSelectedProduct: false }).canSubmit, false);
  assert.equal(evaluation({ actualStockText: '10' }).canSubmit, false);
  assert.equal(evaluation({ reason: 'DAMAGED' }).canSubmit, false);
  assert.equal(evaluation({ isSubmitting: true }).canSubmit, false);
  assert.equal(evaluation({ canPersist: false }).canSubmit, false);
});

test('negative adjustment does not require cost input', () => {
  assert.equal(
    evaluation({
      actualStockText: '7',
      costMode: 'CUSTOM_COST',
      customUnitCostText: '',
      reason: 'DAMAGED',
    }).canSubmit,
    true,
  );
});
