import assert from 'node:assert/strict';
import test from 'node:test';

import type { HistoryEntry, SaleDetails } from '@stock-app/application';
import { Money } from '@stock-app/domain';

import {
  createSaleDetailsPresentation,
  createSaleDetailsRequest,
  createSaleDetailsRoute,
  getHistorySaleRoute,
  getSaleDetailsContentKind,
  normalizeSaleIdParam,
  type SaleDetailsState,
} from '../src/ui/sales/sale-details-presentation';

function details(overrides: Partial<SaleDetails> = {}): SaleDetails {
  return {
    id: 'sale-123',
    effectiveAt: 1_777_000_000_000,
    createdAt: 1_777_000_000_001,
    status: 'CONFIRMED',
    totalAmount: Money.fromDecimal('3.25'),
    estimatedCost: Money.fromDecimal('2.10'),
    estimatedProfit: Money.fromDecimal('1.15'),
    notes: null,
    totalUnits: 3,
    items: [
      {
        id: 'item-1',
        productId: 'product-1',
        productName: 'Coca-Cola',
        productVariant: '500 ml',
        quantity: 2,
        unitSalePrice: Money.fromDecimal('1.00'),
        subtotal: Money.fromDecimal('2.00'),
        unitCostSnapshot: Money.fromDecimal('0.70'),
        estimatedCost: Money.fromDecimal('1.40'),
        estimatedProfit: Money.fromDecimal('0.60'),
        costStatus: 'KNOWN',
      },
      {
        id: 'item-2',
        productId: 'product-2',
        productName: 'Doritos',
        productVariant: null,
        quantity: 1,
        unitSalePrice: Money.fromDecimal('1.25'),
        subtotal: Money.fromDecimal('1.25'),
        unitCostSnapshot: null,
        estimatedCost: null,
        estimatedProfit: null,
        costStatus: 'UNKNOWN',
      },
    ],
    ...overrides,
  };
}

test('navigation carries only the selected Sale ID', () => {
  assert.deepEqual(createSaleDetailsRoute('sale-123'), {
    pathname: '/sale/[id]',
    params: { id: 'sale-123' },
  });
  assert.deepEqual(createSaleDetailsRequest('inventory-123', 'sale-123'), {
    inventoryId: 'inventory-123',
    saleId: 'sale-123',
  });
});

test('only Sale History entries expose a detail route', () => {
  const saleEntry: HistoryEntry = {
    type: 'SALE',
    id: 'sale-123',
    totalAmount: Money.fromDecimal('1.00'),
    units: 1,
    status: 'CONFIRMED',
    effectiveAt: 1,
    createdAt: 1,
  };
  const purchaseEntry: HistoryEntry = {
    type: 'PURCHASE',
    id: 'purchase-123',
    productId: 'product-1',
    productName: 'Agua',
    productVariant: null,
    quantity: 1,
    unitCost: Money.fromDecimal('0.50'),
    totalAmount: Money.fromDecimal('0.50'),
    status: 'CONFIRMED',
    effectiveAt: 1,
    createdAt: 1,
  };
  const adjustmentEntry: HistoryEntry = {
    type: 'ADJUSTMENT',
    id: 'adjustment-123',
    productId: 'product-1',
    productName: 'Agua',
    productVariant: null,
    difference: -1,
    reason: 'DAMAGED',
    effectiveAt: 1,
    createdAt: 1,
  };

  assert.deepEqual(
    getHistorySaleRoute(saleEntry),
    createSaleDetailsRoute('sale-123'),
  );
  assert.equal(getHistorySaleRoute(purchaseEntry), null);
  assert.equal(getHistorySaleRoute(adjustmentEntry), null);
});

test('normalizes a valid dynamic Sale ID and rejects ambiguous values', () => {
  assert.equal(normalizeSaleIdParam(' sale-123 '), 'sale-123');
  assert.equal(normalizeSaleIdParam(undefined), null);
  assert.equal(normalizeSaleIdParam('   '), null);
  assert.equal(normalizeSaleIdParam(['sale-1', 'sale-2']), null);
});

test('presents confirmed multi-product details and preserves historical snapshots', () => {
  const presentation = createSaleDetailsPresentation(details(), 'USD');

  assert.equal(presentation.statusLabel, 'Confirmada');
  assert.equal(presentation.totalUnitsLabel, '3 unidades');
  assert.equal(presentation.totalAmountLabel, 'USD 3.25');
  assert.equal(presentation.estimatedCostLabel, 'USD 2.10');
  assert.equal(presentation.estimatedProfitLabel, 'USD 1.15');
  assert.equal(presentation.items.length, 2);
  assert.deepEqual(presentation.items[0], {
    id: 'item-1',
    productName: 'Coca-Cola',
    productVariant: '500 ml',
    quantityAndPriceLabel: '2 × USD 1.00',
    subtotalLabel: 'USD 2.00',
    unitCostLabel: 'USD 0.70',
    estimatedProfitLabel: 'USD 0.60',
  });
  assert.equal(presentation.items[1]?.productName, 'Doritos');
  assert.equal(presentation.items[1]?.unitCostLabel, 'No disponible');
  assert.equal(presentation.items[1]?.estimatedProfitLabel, 'No disponible');
});

test('presents known zero cost distinctly from unknown cost', () => {
  const zeroCostLine = {
    ...details().items[0]!,
    unitCostSnapshot: Money.zero(),
    estimatedCost: Money.zero(),
    estimatedProfit: Money.fromDecimal('2.00'),
  };
  const presentation = createSaleDetailsPresentation(
    details({ items: [zeroCostLine] }),
    'USD',
  );

  assert.equal(presentation.items[0]?.unitCostLabel, 'USD 0.00');
  assert.equal(presentation.items[0]?.estimatedProfitLabel, 'USD 2.00');
});

test('presents unavailable product labels safely without hiding the line', () => {
  const missingProduct = {
    ...details().items[0]!,
    productName: null,
    productVariant: null,
  };
  const presentation = createSaleDetailsPresentation(
    details({ items: [missingProduct] }),
    'USD',
  );

  assert.equal(presentation.items[0]?.productName, 'Producto no disponible');
  assert.equal(presentation.items[0]?.subtotalLabel, 'USD 2.00');
});

test('presents VOIDED without erasing historical amounts', () => {
  const presentation = createSaleDetailsPresentation(
    details({ status: 'VOIDED' }),
    'USD',
  );

  assert.equal(presentation.statusLabel, 'Anulada');
  assert.equal(presentation.isVoided, true);
  assert.equal(presentation.totalAmountLabel, 'USD 3.25');
});

for (const [state, expected] of [
  [{ status: 'loading' }, 'loading'],
  [{ status: 'ready', details: details() }, 'loaded'],
  [{ status: 'ready', details: null }, 'not-found'],
  [{ status: 'error' }, 'error'],
] as const satisfies readonly (readonly [
  SaleDetailsState,
  'loading' | 'loaded' | 'not-found' | 'error',
])[]) {
  test(`Sale detail resolves ${expected} content`, () => {
    assert.equal(getSaleDetailsContentKind(state), expected);
  });
}
