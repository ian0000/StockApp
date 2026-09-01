import assert from 'node:assert/strict';
import test from 'node:test';

import type { ProductSummary } from '@stock-app/application';
import { createInventoryState, createProduct, Money } from '@stock-app/domain';

import {
  createSaleScanResultGate,
  getSaleScannerActionPresentation,
  normalizeSaleScanResult,
  resolveSaleScanProduct,
} from '../src/ui/sales/sale-barcode-scanner';
import {
  addProductToCart,
  createRegisterSaleLines,
  updateCartItemPrice,
} from '../src/ui/sales/sale-cart';

function summary({
  id,
  price = '1.25',
  stock = 10,
}: {
  readonly id: string;
  readonly price?: string;
  readonly stock?: number;
}): ProductSummary {
  return {
    product: createProduct({
      id,
      inventoryId: 'inventory-1',
      name: `Product ${id}`,
      barcode: `00${id}`,
      regularSalePrice: Money.fromDecimal(price),
      createdAt: 1,
      updatedAt: 1,
    }),
    state: createInventoryState({
      stock,
      unitCost: stock > 0 ? Money.fromDecimal('0.5') : null,
    }),
    isLowStock: stock <= 0,
  };
}

test('normalizes one safe Sale scan result and rejects ambiguous route params', () => {
  assert.deepEqual(normalizeSaleScanResult(' product-1 ', ' scan-1 '), {
    productId: 'product-1',
    requestId: 'scan-1',
  });

  for (const [productId, requestId] of [
    [undefined, undefined],
    ['', 'scan-1'],
    ['product-1', '   '],
    [['product-1'], 'scan-1'],
    ['product-1', ['scan-1']],
  ] as const) {
    assert.equal(normalizeSaleScanResult(productId, requestId), null);
  }
});

test('consumes each Sale scan request exactly once while allowing a later scan', () => {
  const gate = createSaleScanResultGate();

  assert.equal(gate.tryConsume('scan-1'), true);
  assert.equal(gate.tryConsume('scan-1'), false);
  assert.equal(gate.tryConsume('scan-2'), true);
});

test('native Sale exposes scanner without requesting permission from its action', () => {
  assert.deepEqual(getSaleScannerActionPresentation('ios'), {
    label: 'Escanear producto',
    enabled: true,
    status: null,
  });
  assert.deepEqual(getSaleScannerActionPresentation('android'), {
    label: 'Escanear producto',
    enabled: true,
    status: null,
  });
});

test('Web keeps manual Sale available without presenting a fake scanner', () => {
  assert.deepEqual(getSaleScannerActionPresentation('web'), {
    label: 'Escanear producto',
    enabled: false,
    status: 'Solo móvil',
  });
});

test('scanned Product enters the existing cart with quantity one and regular price', () => {
  const product = summary({ id: 'coca', price: '0.75' });
  const result = normalizeSaleScanResult('coca', 'scan-1')!;
  const matched = resolveSaleScanProduct([product], result);
  const cart = matched === null ? [] : addProductToCart([], matched);

  assert.equal(cart.length, 1);
  assert.equal(cart[0]?.quantity, 1);
  assert.equal(cart[0]?.unitSalePrice.scaledUnits, 750_000);
});

test('scanning an existing line increments it and preserves its edited price', () => {
  const product = summary({ id: 'coca', price: '1.25' });
  const edited = updateCartItemPrice(
    addProductToCart([], product),
    'coca',
    '0,90',
  );
  const matched = resolveSaleScanProduct(
    [product],
    normalizeSaleScanResult('coca', 'scan-2')!,
  );
  const cart = matched === null ? edited : addProductToCart(edited, matched);

  assert.equal(cart.length, 1);
  assert.equal(cart[0]?.quantity, 2);
  assert.equal(cart[0]?.unitSalePrice.scaledUnits, 900_000);
  assert.equal(cart[0]?.unitSalePriceText, '0,90');
});

test('zero and negative stock do not block scanned Products from the cart', () => {
  for (const stock of [0, -3]) {
    const product = summary({ id: `stock-${stock}`, stock });
    const matched = resolveSaleScanProduct(
      [product],
      normalizeSaleScanResult(product.product.id, `scan-${stock}`)!,
    );
    const cart = matched === null ? [] : addProductToCart([], matched);

    assert.equal(cart.length, 1);
    assert.equal(cart[0]?.availableStock, stock);
  }
});

test('not-found scan leaves the complete cart unchanged', () => {
  const existing = updateCartItemPrice(
    addProductToCart([], summary({ id: 'existing' })),
    'existing',
    '0,80',
  );
  const matched = resolveSaleScanProduct(
    [],
    normalizeSaleScanResult('missing', 'scan-1')!,
  );

  assert.equal(matched, null);
  assert.equal(existing[0]?.quantity, 1);
  assert.equal(existing[0]?.unitSalePriceText, '0,80');
});

test('scanner and manual selection produce the same RegisterSale lines', () => {
  const product = summary({ id: 'coca', price: '0.75' });
  const matched = resolveSaleScanProduct(
    [product],
    normalizeSaleScanResult('coca', 'scan-1')!,
  );
  const scannedCart = matched === null ? [] : addProductToCart([], matched);
  const manualCart = addProductToCart([], product);

  assert.deepEqual(
    createRegisterSaleLines(scannedCart),
    createRegisterSaleLines(manualCart),
  );
});
