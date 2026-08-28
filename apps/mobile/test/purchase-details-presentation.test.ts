import assert from 'node:assert/strict';
import test from 'node:test';

import type { HistoryEntry, PurchaseDetails } from '@stock-app/application';
import { Money } from '@stock-app/domain';

import {
  createPurchaseDetailsPresentation,
  createPurchaseDetailsRequest,
  createPurchaseDetailsRoute,
  getHistoryPurchaseRoute,
  getPurchaseDetailsContentKind,
  normalizePurchaseIdParam,
  type PurchaseDetailsState,
} from '../src/ui/purchases/purchase-details-presentation';

function details(overrides: Partial<PurchaseDetails> = {}): PurchaseDetails {
  return {
    id: 'purchase-123',
    productId: 'product-1',
    productName: 'Coca-Cola',
    productVariant: '500 ml',
    quantity: 12,
    unitCost: Money.fromDecimal('0.85'),
    totalAmount: Money.fromDecimal('10.20'),
    effectiveAt: 1_777_000_000_000,
    createdAt: 1_777_000_000_001,
    status: 'CONFIRMED',
    notes: null,
    averageCostBefore: Money.fromDecimal('1.00'),
    averageCostAfter: Money.fromDecimal('0.918182'),
    stockBefore: 10,
    stockAfter: 22,
    ...overrides,
  };
}

test('navigation carries only the selected Purchase ID', () => {
  assert.deepEqual(createPurchaseDetailsRoute('purchase-123'), {
    pathname: '/purchase/[id]',
    params: { id: 'purchase-123' },
  });
  assert.deepEqual(
    createPurchaseDetailsRequest('inventory-123', 'purchase-123'),
    { inventoryId: 'inventory-123', purchaseId: 'purchase-123' },
  );
});

test('only Purchase History entries expose a Purchase detail route', () => {
  const purchase: HistoryEntry = {
    type: 'PURCHASE',
    id: 'purchase-123',
    productId: 'product-1',
    productName: 'Coca-Cola',
    productVariant: null,
    quantity: 1,
    unitCost: Money.fromDecimal('0.50'),
    totalAmount: Money.fromDecimal('0.50'),
    status: 'CONFIRMED',
    effectiveAt: 1,
    createdAt: 1,
  };
  const sale: HistoryEntry = {
    type: 'SALE',
    id: 'sale-123',
    totalAmount: Money.fromDecimal('1.00'),
    units: 1,
    status: 'CONFIRMED',
    effectiveAt: 1,
    createdAt: 1,
  };
  const adjustment: HistoryEntry = {
    type: 'ADJUSTMENT',
    id: 'adjustment-123',
    productId: 'product-1',
    productName: 'Coca-Cola',
    productVariant: null,
    difference: -1,
    reason: 'DAMAGED',
    effectiveAt: 1,
    createdAt: 1,
  };

  assert.deepEqual(
    getHistoryPurchaseRoute(purchase),
    createPurchaseDetailsRoute('purchase-123'),
  );
  assert.equal(getHistoryPurchaseRoute(sale), null);
  assert.equal(getHistoryPurchaseRoute(adjustment), null);
});

test('normalizes a valid dynamic Purchase ID and rejects ambiguous values', () => {
  assert.equal(normalizePurchaseIdParam(' purchase-123 '), 'purchase-123');
  assert.equal(normalizePurchaseIdParam(undefined), null);
  assert.equal(normalizePurchaseIdParam('   '), null);
  assert.equal(normalizePurchaseIdParam(['purchase-1', 'purchase-2']), null);
});

test('presents confirmed Purchase and every persisted operation snapshot', () => {
  const presentation = createPurchaseDetailsPresentation(details(), 'USD');

  assert.equal(presentation.statusLabel, 'Confirmada');
  assert.equal(presentation.productName, 'Coca-Cola');
  assert.equal(presentation.productVariant, '500 ml');
  assert.equal(presentation.quantityLabel, '12 unidades');
  assert.equal(presentation.unitCostLabel, 'USD 0.85');
  assert.equal(presentation.totalAmountLabel, 'USD 10.20');
  assert.equal(presentation.stockTransitionLabel, '10 → 22 unidades');
  assert.equal(presentation.averageCostBeforeLabel, 'USD 1.00');
  assert.equal(presentation.averageCostAfterLabel, 'USD 0.92');
});

test('preserves negative stock snapshots and unavailable previous cost', () => {
  const presentation = createPurchaseDetailsPresentation(
    details({
      stockBefore: -2,
      stockAfter: 8,
      averageCostBefore: null,
      averageCostAfter: Money.fromDecimal('0.85'),
    }),
    'USD',
  );

  assert.equal(presentation.stockTransitionLabel, '-2 → 8 unidades');
  assert.equal(presentation.averageCostBeforeLabel, 'No disponible');
  assert.equal(presentation.averageCostAfterLabel, 'USD 0.85');
});

test('preserves known zero and exact six-decimal historical costs', () => {
  const zero = createPurchaseDetailsPresentation(
    details({
      unitCost: Money.zero(),
      totalAmount: Money.zero(),
      averageCostAfter: Money.zero(),
    }),
    'USD',
  );
  const precise = createPurchaseDetailsPresentation(
    details({ unitCost: Money.fromDecimal('0.123456') }),
    'USD',
  );

  assert.equal(zero.unitCostLabel, 'USD 0.00');
  assert.equal(zero.totalAmountLabel, 'USD 0.00');
  assert.equal(zero.averageCostAfterLabel, 'USD 0.00');
  assert.equal(precise.unitCostLabel, 'USD 0.12');
});

test('presents unavailable Product safely and VOIDED without erasing values', () => {
  const presentation = createPurchaseDetailsPresentation(
    details({
      productName: null,
      productVariant: null,
      status: 'VOIDED',
    }),
    'USD',
  );

  assert.equal(presentation.productName, 'Producto no disponible');
  assert.equal(presentation.statusLabel, 'Anulada');
  assert.equal(presentation.isVoided, true);
  assert.equal(presentation.quantityLabel, '12 unidades');
  assert.equal(presentation.totalAmountLabel, 'USD 10.20');
});

for (const [state, expected] of [
  [{ status: 'loading' }, 'loading'],
  [{ status: 'ready', details: details() }, 'loaded'],
  [{ status: 'ready', details: null }, 'not-found'],
  [{ status: 'error' }, 'error'],
] as const satisfies readonly (readonly [
  PurchaseDetailsState,
  'loading' | 'loaded' | 'not-found' | 'error',
])[]) {
  test(`Purchase detail resolves ${expected} content`, () => {
    assert.equal(getPurchaseDetailsContentKind(state), expected);
  });
}
