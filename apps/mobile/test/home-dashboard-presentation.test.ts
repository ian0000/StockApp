import assert from 'node:assert/strict';
import test from 'node:test';

import type { TopSellingProduct } from '@stock-app/application';
import { createInventoryState, createProduct, Money } from '@stock-app/domain';

import {
  createHomeLowStockPresentation,
  createTopSellingProductPresentation,
  getHomeBlockContentKind,
  PRODUCTS_TAB_ROUTE,
} from '../src/ui/home/home-dashboard-presentation';

function productSummary(
  isLowStock: boolean,
  {
    id = 'product-a',
    name = 'Agua',
    variant = null,
    stock = 2,
  }: {
    readonly id?: string;
    readonly name?: string;
    readonly variant?: string | null;
    readonly stock?: number;
  } = {},
) {
  return {
    isLowStock,
    product: createProduct({
      id,
      inventoryId: 'inventory-1',
      name,
      variant,
      regularSalePrice: Money.fromDecimal('1'),
      minimumStock: 3,
      createdAt: 1,
      updatedAt: 1,
    }),
    state: createInventoryState({
      stock,
      unitCost: stock > 0 ? Money.fromDecimal('0.5') : null,
    }),
  };
}

for (const [products, count, message] of [
  [[], 0, 'Todo bien por ahora'],
  [[productSummary(true)], 1, '1 producto necesita atención'],
  [
    [productSummary(true), productSummary(false), productSummary(true)],
    2,
    '2 productos necesitan atención',
  ],
] as const) {
  test(`presents the Home low-stock count ${count}`, () => {
    const presentation = createHomeLowStockPresentation(products);

    assert.equal(presentation.count, count);
    assert.equal(presentation.message, message);
  });
}

test('presents at most two low-stock products in deterministic input order', () => {
  const presentation = createHomeLowStockPresentation([
    productSummary(true, {
      id: 'product-c',
      name: 'Cola',
      variant: '500 ml',
      stock: -1,
    }),
    productSummary(false, { id: 'product-normal' }),
    productSummary(true, { id: 'product-b', name: 'Galletas', stock: 0 }),
    productSummary(true, { id: 'product-a', name: 'Agua', stock: 1 }),
  ]);

  assert.deepEqual(presentation.preview, [
    {
      productId: 'product-c',
      name: 'Cola',
      variant: '500 ml',
      stockLabel: '-1 unidades',
    },
    {
      productId: 'product-b',
      name: 'Galletas',
      variant: null,
      stockLabel: '0 unidades',
    },
  ]);
  assert.equal(presentation.count, 3);
});

test('a fresh product read updates the low-stock count after stock changes', () => {
  const before = [productSummary(true), productSummary(false)];
  const afterSale = [productSummary(true), productSummary(true)];
  const afterPurchaseOrAdjustment = [
    productSummary(false),
    productSummary(false),
  ];

  assert.equal(createHomeLowStockPresentation(before).count, 1);
  assert.equal(createHomeLowStockPresentation(afterSale).count, 2);
  assert.equal(
    createHomeLowStockPresentation(afterPurchaseOrAdjustment).count,
    0,
  );
});

test('the low-stock block navigates to Products without inventing a filter', () => {
  assert.equal(PRODUCTS_TAB_ROUTE, '/products');
});

test('presents top-selling product name, optional variant and plural units', () => {
  const topProduct: TopSellingProduct = {
    productId: 'product-b',
    name: 'Coca-Cola',
    variant: '500 ml',
    unitsSold: 5,
  };

  assert.deepEqual(createTopSellingProductPresentation(topProduct), {
    name: 'Coca-Cola',
    variant: '500 ml',
    unitsLabel: '5 unidades vendidas hoy',
    route: {
      pathname: '/product/[id]',
      params: { id: 'product-b' },
    },
  });
});

test('top-selling product presentation handles singular units and no variant', () => {
  const presentation = createTopSellingProductPresentation({
    productId: 'product-a',
    name: 'Agua',
    variant: null,
    unitsSold: 1,
  });

  assert.equal(presentation.variant, null);
  assert.equal(presentation.unitsLabel, '1 unidad vendida hoy');
});

for (const [state, expected] of [
  [{ status: 'loading' }, 'loading'],
  [{ status: 'error' }, 'error'],
  [{ status: 'ready', value: null }, 'empty'],
  [
    {
      status: 'ready',
      value: {
        productId: 'product-a',
        name: 'Agua',
        variant: null,
        unitsSold: 1,
      },
    },
    'ready',
  ],
] as const) {
  test(`resolves an independent Home block as ${expected}`, () => {
    assert.equal(getHomeBlockContentKind(state), expected);
  });
}
