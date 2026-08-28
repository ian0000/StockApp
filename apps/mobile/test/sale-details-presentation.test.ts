import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SaleNotFoundError,
  type HistoryEntry,
  type SaleDetails,
  type VoidSaleResult,
} from '@stock-app/application';
import { createSale, Money, type SaleStatus } from '@stock-app/domain';

import {
  createSaleDetailsPresentation,
  createSaleDetailsRequest,
  createSaleDetailsRoute,
  createSaleVoidSubmissionGate,
  getHistorySaleRoute,
  getSaleDetailsContentKind,
  getSaleVoidErrorPresentation,
  getSaleVoidResultPresentation,
  isSaleVoidActionVisible,
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

function sale(status: SaleStatus = 'CONFIRMED') {
  return createSale({
    id: 'sale-123',
    inventoryId: 'inventory-123',
    effectiveAt: 1_777_000_000_000,
    createdAt: 1_777_000_000_001,
    updatedAt: 1_777_000_000_001,
    status,
    totalAmount: Money.fromDecimal('3.25'),
    estimatedCost: Money.fromDecimal('2.10'),
    estimatedProfit: Money.fromDecimal('1.15'),
    notes: null,
  });
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

test('shows the void action only for a persisted CONFIRMED Sale', () => {
  assert.equal(isSaleVoidActionVisible('CONFIRMED', 'sqlite'), true);
  assert.equal(isSaleVoidActionVisible('VOIDED', 'sqlite'), false);
  assert.equal(isSaleVoidActionVisible('CONFIRMED', 'web-preview'), false);
});

test('presents successful and idempotent void results without technical errors', () => {
  const voided: VoidSaleResult = {
    kind: 'VOIDED',
    sale: sale('VOIDED'),
    reversals: [],
  };
  const alreadyVoided: VoidSaleResult = {
    kind: 'ALREADY_VOIDED',
    sale: sale('VOIDED'),
    reversals: [],
  };

  assert.deepEqual(getSaleVoidResultPresentation(voided), {
    kind: 'success',
    title: 'Venta anulada',
    message:
      'El stock fue restaurado y la venta permanece en tu historial como anulada.',
    shouldRefresh: true,
    canRetry: false,
  });
  assert.deepEqual(getSaleVoidResultPresentation(alreadyVoided), {
    kind: 'information',
    title: 'Venta ya anulada',
    message: 'Esta venta ya estaba anulada.',
    shouldRefresh: true,
    canRetry: false,
  });
});

test('presents a non-eligible result as a commercial message without mutating details', () => {
  const result: VoidSaleResult = {
    kind: 'NOT_ELIGIBLE',
    sale: sale(),
    reason: 'SUBSEQUENT_OR_AMBIGUOUS_MOVEMENT',
  };

  assert.deepEqual(getSaleVoidResultPresentation(result), {
    kind: 'not-eligible',
    title: 'No se puede anular esta venta',
    message:
      'Hay operaciones posteriores de uno o más productos y ya no es posible restaurar el inventario de forma segura.',
    shouldRefresh: false,
    canRetry: false,
  });
});

test('distinguishes not-found from retryable technical failures', () => {
  assert.deepEqual(getSaleVoidErrorPresentation(new SaleNotFoundError()), {
    kind: 'not-found',
    shouldRefresh: true,
    canRetry: false,
  });
  assert.deepEqual(getSaleVoidErrorPresentation(new Error('database failed')), {
    kind: 'technical-error',
    title: 'No pudimos anular la venta',
    message: 'Inténtalo nuevamente. Tus datos no fueron modificados.',
    shouldRefresh: false,
    canRetry: true,
  });
});

test('submission gate prevents a second confirmation while voiding', () => {
  const gate = createSaleVoidSubmissionGate();

  assert.equal(gate.tryStart(), true);
  assert.equal(gate.tryStart(), false);
  gate.finish();
  assert.equal(gate.tryStart(), true);
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
