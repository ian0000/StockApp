import assert from 'node:assert/strict';
import test from 'node:test';

import type { ProductDetails } from '@stock-app/application';
import { Money, Percentage } from '@stock-app/domain';

import {
  createProductDetailsPresentation,
  createProductDetailsRequest,
  createProductDetailsRoute,
  formatPercentageForDisplay,
  getProductDetailsContentKind,
  normalizeProductIdParam,
  type ProductDetailsState,
} from '../src/ui/products/product-details-presentation';

function details(overrides: Partial<ProductDetails> = {}): ProductDetails {
  return {
    id: 'product-123',
    name: 'Coca-Cola',
    variant: '500 ml',
    stock: 12,
    unitCost: Money.fromDecimal('1.00'),
    regularSalePrice: Money.fromDecimal('1.50'),
    estimatedUnitProfit: Money.fromDecimal('0.50'),
    margin: Percentage.fromScaledUnits(33_333_333),
    markup: Percentage.fromScaledUnits(50_000_000),
    ...overrides,
  };
}

test('navigation carries only the selected product ID', () => {
  assert.deepEqual(createProductDetailsRoute('product-123'), {
    pathname: '/product/[id]',
    params: { id: 'product-123' },
  });
});

test('detail request scopes the product to the current inventory', () => {
  assert.deepEqual(
    createProductDetailsRequest('inventory-123', 'product-123'),
    { inventoryId: 'inventory-123', productId: 'product-123' },
  );
});

test('normalizes a valid dynamic route ID without accepting ambiguous values', () => {
  assert.equal(normalizeProductIdParam(' product-123 '), 'product-123');
  assert.equal(normalizeProductIdParam(undefined), null);
  assert.equal(normalizeProductIdParam('   '), null);
  assert.equal(normalizeProductIdParam(['product-1', 'product-2']), null);
});

test('presents loaded product details with existing money and percentage values', () => {
  assert.deepEqual(createProductDetailsPresentation(details(), 'usd'), {
    name: 'Coca-Cola',
    variant: '500 ml',
    stockLabel: '12 unidades',
    stockStatus: 'positive',
    costLabel: 'USD 1.00',
    priceLabel: 'USD 1.50',
    estimatedUnitProfitLabel: 'USD 0.50',
    marginLabel: '33.33%',
    markupLabel: '50.00%',
  });
});

test('omits an absent variant instead of inventing a placeholder', () => {
  assert.equal(
    createProductDetailsPresentation(details({ variant: null }), 'USD').variant,
    null,
  );
});

test('preserves zero stock', () => {
  const presentation = createProductDetailsPresentation(
    details({ stock: 0 }),
    'USD',
  );

  assert.equal(presentation.stockLabel, '0 unidades');
  assert.equal(presentation.stockStatus, 'zero');
});

test('preserves negative stock and exposes a non-color status', () => {
  const presentation = createProductDetailsPresentation(
    details({ stock: -3 }),
    'USD',
  );

  assert.equal(presentation.stockLabel, '-3 unidades');
  assert.equal(presentation.stockStatus, 'negative');
});

test('distinguishes unknown cost from known zero', () => {
  const unknown = createProductDetailsPresentation(
    details({
      unitCost: null,
      estimatedUnitProfit: null,
      margin: null,
      markup: null,
    }),
    'USD',
  );
  const zero = createProductDetailsPresentation(
    details({ unitCost: Money.zero(), markup: null }),
    'USD',
  );

  assert.equal(unknown.costLabel, 'Costo desconocido');
  assert.equal(unknown.estimatedUnitProfitLabel, 'No disponible');
  assert.equal(unknown.marginLabel, 'No disponible');
  assert.equal(unknown.markupLabel, 'No disponible');
  assert.equal(zero.costLabel, 'USD 0.00');
  assert.equal(zero.markupLabel, 'No disponible');
});

test('preserves a known zero sale price', () => {
  const presentation = createProductDetailsPresentation(
    details({ regularSalePrice: Money.zero(), margin: null }),
    'USD',
  );

  assert.equal(presentation.priceLabel, 'USD 0.00');
  assert.equal(presentation.marginLabel, 'No disponible');
});

test('formats percentages without floating-point division', () => {
  assert.equal(
    formatPercentageForDisplay(Percentage.fromScaledUnits(33_333_333)),
    '33.33%',
  );
  assert.equal(
    formatPercentageForDisplay(Percentage.fromScaledUnits(33_335_000)),
    '33.34%',
  );
  assert.equal(
    formatPercentageForDisplay(Percentage.fromScaledUnits(-20_000_000)),
    '-20.00%',
  );
});

for (const [state, expected] of [
  [{ status: 'loading' }, 'loading'],
  [{ status: 'ready', details: details() }, 'loaded'],
  [{ status: 'ready', details: null }, 'not-found'],
  [{ status: 'error' }, 'error'],
] as const satisfies readonly (readonly [
  ProductDetailsState,
  'loading' | 'loaded' | 'not-found' | 'error',
])[]) {
  test(`detail resolves ${expected} content`, () => {
    assert.equal(getProductDetailsContentKind(state), expected);
  });
}
