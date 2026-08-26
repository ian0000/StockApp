import assert from 'node:assert/strict';
import test from 'node:test';

import { Money, type TimestampMs } from '@stock-app/domain';
import type { HistoryEntry } from '@stock-app/application';

import {
  createHistoryRowPresentation,
  createRecentOperationsRequest,
  getRecentOperationsContentKind,
  HISTORY_TAB_ROUTE,
  type RecentOperationsState,
} from '../src/ui/history/history-presentation';

const EFFECTIVE_AT = 1_776_444_000_000 as TimestampMs;
const CREATED_AT = 1_776_444_000_100 as TimestampMs;

function sale(
  overrides: Partial<Extract<HistoryEntry, { type: 'SALE' }>> = {},
): Extract<HistoryEntry, { type: 'SALE' }> {
  return {
    type: 'SALE',
    id: 'sale-1',
    totalAmount: Money.fromDecimal('12.5'),
    units: 4,
    status: 'CONFIRMED',
    effectiveAt: EFFECTIVE_AT,
    createdAt: CREATED_AT,
    ...overrides,
  };
}

function purchase(
  overrides: Partial<Extract<HistoryEntry, { type: 'PURCHASE' }>> = {},
): Extract<HistoryEntry, { type: 'PURCHASE' }> {
  return {
    type: 'PURCHASE',
    id: 'purchase-1',
    productId: 'product-1',
    productName: 'Coca-Cola',
    productVariant: '500 ml',
    quantity: 10,
    unitCost: Money.fromDecimal('1.2'),
    totalAmount: Money.fromDecimal('12'),
    status: 'CONFIRMED',
    effectiveAt: EFFECTIVE_AT,
    createdAt: CREATED_AT,
    ...overrides,
  };
}

function adjustment(
  overrides: Partial<Extract<HistoryEntry, { type: 'ADJUSTMENT' }>> = {},
): Extract<HistoryEntry, { type: 'ADJUSTMENT' }> {
  return {
    type: 'ADJUSTMENT',
    id: 'adjustment-1',
    productId: 'product-1',
    productName: 'Doritos',
    productVariant: null,
    difference: 5,
    reason: 'COUNT_CORRECTION',
    effectiveAt: EFFECTIVE_AT,
    createdAt: CREATED_AT,
    ...overrides,
  };
}

test('Home requests exactly five recent operations', () => {
  assert.deepEqual(createRecentOperationsRequest('inventory-1'), {
    inventoryId: 'inventory-1',
    limit: 5,
  });
});

test('normal Sale presentation includes units and exact total', () => {
  const row = createHistoryRowPresentation(sale(), 'USD', 'recent');

  assert.deepEqual(row, {
    typeLabel: 'VENTA',
    primary: 'USD 12.50',
    secondary: null,
    detail: '4 unidades',
    timestamp: EFFECTIVE_AT,
    isVoided: false,
  });
});

test('VOIDED Sale remains visible as annulled with original values', () => {
  const row = createHistoryRowPresentation(
    sale({ status: 'VOIDED' }),
    'USD',
    'recent',
  );

  assert.equal(row.primary, 'USD 12.50');
  assert.equal(row.detail, '4 unidades');
  assert.equal(row.isVoided, true);
});

test('recent Purchase presentation includes product, variant, quantity and total', () => {
  const row = createHistoryRowPresentation(purchase(), 'USD', 'recent');

  assert.deepEqual(row, {
    typeLabel: 'COMPRA',
    primary: 'Coca-Cola',
    secondary: '500 ml',
    detail: '+10 unidades · USD 12.00',
    timestamp: EFFECTIVE_AT,
    isVoided: false,
  });
});

test('VOIDED Purchase remains visible as annulled', () => {
  const row = createHistoryRowPresentation(
    purchase({ status: 'VOIDED' }),
    'USD',
    'recent',
  );

  assert.equal(row.isVoided, true);
  assert.equal(row.primary, 'Coca-Cola');
  assert.equal(row.detail, '+10 unidades · USD 12.00');
});

test('History Purchase presentation keeps its approved unit-cost detail', () => {
  const row = createHistoryRowPresentation(purchase(), 'USD', 'history');

  assert.equal(row.detail, '+10 · USD 1.20 c/u');
});

test('positive StockAdjustment includes signed difference and localized reason', () => {
  const row = createHistoryRowPresentation(adjustment(), 'USD', 'recent');

  assert.deepEqual(row, {
    typeLabel: 'AJUSTE',
    primary: 'Doritos',
    secondary: null,
    detail: '+5 unidades · Conteo incorrecto',
    timestamp: EFFECTIVE_AT,
    isVoided: false,
  });
  assert.equal('cost' in row, false);
});

test('negative StockAdjustment includes sign and localized reason without cost', () => {
  const row = createHistoryRowPresentation(
    adjustment({ difference: -2, reason: 'DAMAGED' }),
    'USD',
    'recent',
  );

  assert.equal(row.detail, '-2 unidades · Dañado');
  assert.equal('unitCost' in row, false);
  assert.equal('totalAmount' in row, false);
});

for (const [state, expected] of [
  [{ status: 'loading' }, 'loading'],
  [{ status: 'error' }, 'error'],
  [{ status: 'ready', entries: [] }, 'empty'],
  [{ status: 'ready', entries: [sale()] }, 'ready'],
] as const satisfies readonly (readonly [
  RecentOperationsState,
  'loading' | 'error' | 'empty' | 'ready',
])[]) {
  test(`recent operations resolves ${expected} content`, () => {
    assert.equal(getRecentOperationsContentKind(state), expected);
  });
}

test('the History action targets the existing tab route', () => {
  assert.equal(HISTORY_TAB_ROUTE, '/history');
});

test('row presentation does not expose navigation metadata', () => {
  const row = createHistoryRowPresentation(sale(), 'USD', 'recent');

  assert.equal('href' in row, false);
  assert.equal('route' in row, false);
  assert.equal('onPress' in row, false);
});
