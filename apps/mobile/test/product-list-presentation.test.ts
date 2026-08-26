import assert from 'node:assert/strict';
import test from 'node:test';

import type { ProductSummary } from '@stock-app/application';
import { createInventoryState, createProduct, Money } from '@stock-app/domain';

import {
  createProductListRequest,
  createProductListRowPresentation,
  getProductsContentKind,
  type ProductsState,
} from '../src/ui/products/product-list-presentation';

function summary({
  stock = 12,
  variant = '500 ml',
  regularSalePrice = Money.fromDecimal('1.25'),
}: {
  readonly stock?: number;
  readonly variant?: string | null;
  readonly regularSalePrice?: Money;
} = {}): ProductSummary {
  return {
    product: createProduct({
      id: 'product-1',
      inventoryId: 'inventory-1',
      name: 'Coca-Cola',
      variant,
      regularSalePrice,
      createdAt: 1,
      updatedAt: 1,
    }),
    state: createInventoryState({
      stock,
      unitCost: stock > 0 ? Money.fromDecimal('0.70') : null,
    }),
  };
}

test('Products requests the current inventory explicitly', () => {
  assert.deepEqual(createProductListRequest('inventory-1'), {
    inventoryId: 'inventory-1',
  });
});

test('presents a normal product with positive stock and exact display price', () => {
  assert.deepEqual(createProductListRowPresentation(summary(), 'USD'), {
    name: 'Coca-Cola',
    variant: '500 ml',
    stockLabel: '12 unidades',
    stockStatus: 'positive',
    priceLabel: 'USD 1.25',
  });
});

test('preserves a product variant when present', () => {
  assert.equal(
    createProductListRowPresentation(summary(), 'USD').variant,
    '500 ml',
  );
});

test('keeps an absent variant as null without a placeholder', () => {
  assert.equal(
    createProductListRowPresentation(summary({ variant: null }), 'USD').variant,
    null,
  );
});

test('preserves zero stock as zero', () => {
  const row = createProductListRowPresentation(summary({ stock: 0 }), 'USD');

  assert.equal(row.stockLabel, '0 unidades');
  assert.equal(row.stockStatus, 'zero');
});

test('preserves negative stock without clamping it', () => {
  const row = createProductListRowPresentation(summary({ stock: -3 }), 'USD');

  assert.equal(row.stockLabel, '-3 unidades');
  assert.equal(row.stockStatus, 'negative');
});

test('preserves a known zero sale price as real zero', () => {
  const row = createProductListRowPresentation(
    summary({ regularSalePrice: Money.zero() }),
    'USD',
  );

  assert.equal(row.priceLabel, 'USD 0.00');
});

for (const [state, expected] of [
  [{ status: 'loading' }, 'loading'],
  [{ status: 'error' }, 'error'],
  [{ status: 'ready', products: [] }, 'empty'],
  [{ status: 'ready', products: [summary()] }, 'ready'],
] as const satisfies readonly (readonly [
  ProductsState,
  'loading' | 'error' | 'empty' | 'ready',
])[]) {
  test(`Products resolves ${expected} content`, () => {
    assert.equal(getProductsContentKind(state), expected);
  });
}

test('product row presentation exposes neither cost nor navigation metadata', () => {
  const row = createProductListRowPresentation(summary(), 'USD');

  assert.equal('unitCost' in row, false);
  assert.equal('href' in row, false);
  assert.equal('route' in row, false);
  assert.equal('onPress' in row, false);
});
