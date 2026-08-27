import assert from 'node:assert/strict';
import test from 'node:test';

import type { ProductSummary } from '@stock-app/application';
import { createInventoryState, createProduct, Money } from '@stock-app/domain';

import { createProductDetailsRoute } from '../src/ui/products/product-details-presentation';
import { filterProductSummaries } from '../src/ui/products/product-search';

function summary({
  id,
  name,
  variant = null,
  barcode = null,
  isArchived = false,
}: {
  readonly id: string;
  readonly name: string;
  readonly variant?: string | null;
  readonly barcode?: string | null;
  readonly isArchived?: boolean;
}): ProductSummary {
  const product = createProduct({
    id,
    inventoryId: 'inventory-1',
    name,
    variant,
    barcode,
    regularSalePrice: Money.fromDecimal('1'),
    createdAt: 1,
    updatedAt: 1,
  });

  return {
    product: Object.freeze({ ...product, isArchived }),
    state: createInventoryState({ stock: 0, unitCost: null }),
  };
}

function ids(products: readonly ProductSummary[]): readonly string[] {
  return products.map(({ product }) => product.id);
}

const products = [
  summary({
    id: 'coca',
    name: 'Coca-Cola 500 ml',
    variant: 'Botella retornable',
    barcode: '0012345',
  }),
  summary({ id: 'shirt', name: 'Camiseta', variant: 'Talla M' }),
  summary({ id: 'water', name: 'Agua', variant: null }),
];

test('matches a complete product name', () => {
  assert.deepEqual(ids(filterProductSummaries(products, 'Coca-Cola 500 ml')), [
    'coca',
  ]);
});

test('matches partial text from any part of the product name', () => {
  assert.deepEqual(ids(filterProductSummaries(products, 'cola')), ['coca']);
  assert.deepEqual(ids(filterProductSummaries(products, '500')), ['coca']);
});

test('matches text case-insensitively and trims the query', () => {
  assert.deepEqual(ids(filterProductSummaries(products, '  cOcA  ')), ['coca']);
});

test('collapses repeated whitespace coherently in query and product text', () => {
  const spacedProducts = [
    summary({ id: 'rice', name: 'Arroz   integral', variant: 'Bolsa   1 kg' }),
  ];

  assert.deepEqual(
    ids(filterProductSummaries(spacedProducts, 'arroz integral')),
    ['rice'],
  );
  assert.deepEqual(ids(filterProductSummaries(spacedProducts, 'bolsa 1 kg')), [
    'rice',
  ]);
});

test('returns no products when text does not match', () => {
  assert.deepEqual(filterProductSummaries(products, 'galletas'), []);
});

test('matches a variant and safely handles a null variant', () => {
  assert.deepEqual(ids(filterProductSummaries(products, 'talla m')), ['shirt']);
  assert.deepEqual(ids(filterProductSummaries(products, 'agua')), ['water']);
});

test('matches barcode exactly while preserving leading zeroes', () => {
  assert.deepEqual(ids(filterProductSummaries(products, '0012345')), ['coca']);
  assert.deepEqual(filterProductSummaries(products, '0012'), []);
  assert.deepEqual(filterProductSummaries(products, '12345'), []);
});

test('empty and whitespace queries return every active product in input order', () => {
  assert.deepEqual(ids(filterProductSummaries(products, '')), [
    'coca',
    'shirt',
    'water',
  ]);
  assert.deepEqual(ids(filterProductSummaries(products, '   ')), [
    'coca',
    'shirt',
    'water',
  ]);
});

test('clearing search restores the original products and order', () => {
  assert.deepEqual(ids(filterProductSummaries(products, 'coca')), ['coca']);
  assert.deepEqual(ids(filterProductSummaries(products, '')), [
    'coca',
    'shirt',
    'water',
  ]);
});

test('a filtered result keeps the selected product ID for detail navigation', () => {
  const [result] = filterProductSummaries(products, 'talla m');

  assert.ok(result);
  assert.equal(result.product.id, 'shirt');
  assert.deepEqual(createProductDetailsRoute(result.product.id), {
    pathname: '/product/[id]',
    params: { id: 'shirt' },
  });
});

test('excludes archived products from empty and matching searches', () => {
  const archived = summary({
    id: 'archived',
    name: 'Producto archivado',
    isArchived: true,
  });

  assert.deepEqual(ids(filterProductSummaries([...products, archived], '')), [
    'coca',
    'shirt',
    'water',
  ]);
  assert.deepEqual(
    filterProductSummaries([...products, archived], 'archivado'),
    [],
  );
});

test('the same retained query filters newly refreshed product data', () => {
  const query = 'coca';

  assert.deepEqual(ids(filterProductSummaries(products, query)), ['coca']);
  assert.deepEqual(
    ids(
      filterProductSummaries(
        [...products, summary({ id: 'coca-zero', name: 'Coca-Cola Zero' })],
        query,
      ),
    ),
    ['coca', 'coca-zero'],
  );
});

test('filtering does not mutate stock, prices, or source product objects', () => {
  const [source] = products;
  const [result] = filterProductSummaries(products, 'coca');

  assert.equal(result, source);
  assert.equal(result?.state.stock, 0);
  assert.equal(result?.product.regularSalePrice.scaledUnits, 1_000_000);
});
