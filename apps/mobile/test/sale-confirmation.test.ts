import assert from 'node:assert/strict';
import test from 'node:test';

import { Money } from '@stock-app/domain';

import { formatEstimatedProfitForDisplay } from '../src/ui/sales/sale-confirmation';

test('formats a known estimated profit using the persisted result value', () => {
  assert.equal(
    formatEstimatedProfitForDisplay(Money.fromDecimal('0.40'), 'USD'),
    'USD 0.40',
  );
});

test('represents an unknown estimated profit without substituting zero', () => {
  assert.equal(formatEstimatedProfitForDisplay(null, 'USD'), '—');
});

test('preserves a known negative estimated profit for presentation', () => {
  assert.equal(
    formatEstimatedProfitForDisplay(Money.fromDecimal('-0.20'), 'USD'),
    'USD -0.20',
  );
});
