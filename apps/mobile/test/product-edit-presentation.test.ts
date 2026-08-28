import assert from 'node:assert/strict';
import test from 'node:test';

import type { ProductDetails } from '@stock-app/application';
import { Money } from '@stock-app/domain';

import {
  createInitialProductEditValues,
  createProductEditRoute,
  getProductEditContentKind,
  type ProductEditState,
} from '../src/ui/products/product-edit-presentation';

function details(overrides: Partial<ProductDetails> = {}): ProductDetails {
  return {
    id: 'product-123',
    name: 'Coca-Cola',
    variant: '500 ml',
    barcode: '0012345',
    minimumStock: 2,
    isLowStock: false,
    stock: -3,
    unitCost: Money.fromDecimal('0.700001'),
    regularSalePrice: Money.fromDecimal('1.250001'),
    estimatedUnitProfit: Money.fromDecimal('0.55'),
    margin: null,
    markup: null,
    ...overrides,
  };
}

test('edit navigation carries only the selected Product ID', () => {
  assert.deepEqual(createProductEditRoute('product-123'), {
    pathname: '/product/edit/[id]',
    params: { id: 'product-123' },
  });
});

test('creates edit values from current persisted Product metadata', () => {
  assert.deepEqual(createInitialProductEditValues(details()), {
    name: 'Coca-Cola',
    variant: '500 ml',
    barcode: '0012345',
    regularSalePrice: '1.250001',
    minimumStock: '2',
  });
});

test('edit values preserve optional absence and known zero price', () => {
  assert.deepEqual(
    createInitialProductEditValues(
      details({
        variant: null,
        barcode: null,
        minimumStock: null,
        regularSalePrice: Money.zero(),
      }),
    ),
    {
      name: 'Coca-Cola',
      variant: '',
      barcode: '',
      regularSalePrice: '0',
      minimumStock: '',
    },
  );
});

test('edit values never expose stock or current cost as editable fields', () => {
  const values = createInitialProductEditValues(details());

  assert.equal('stock' in values, false);
  assert.equal('unitCost' in values, false);
  assert.equal('currentStock' in values, false);
  assert.equal('currentAverageCost' in values, false);
});

for (const [state, expected] of [
  [{ status: 'loading' }, 'loading'],
  [{ status: 'ready', details: details() }, 'loaded'],
  [{ status: 'ready', details: null }, 'not-found'],
  [{ status: 'error' }, 'error'],
] as const satisfies readonly (readonly [
  ProductEditState,
  'loading' | 'loaded' | 'not-found' | 'error',
])[]) {
  test(`edit resolves ${expected} content`, () => {
    assert.equal(getProductEditContentKind(state), expected);
  });
}
