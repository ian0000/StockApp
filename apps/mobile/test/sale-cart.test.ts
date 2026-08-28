import assert from 'node:assert/strict';
import test from 'node:test';

import type { ProductSummary } from '@stock-app/application';
import { createInventoryState, createProduct, Money } from '@stock-app/domain';

import {
  addProductToCart,
  calculateCartItemSubtotal,
  calculateCartTotal,
  decrementCartItem,
  filterSaleProducts,
  getCartSummary,
  getInsufficientCartItems,
  incrementCartItem,
  isCartReadyToRegister,
  isCartItemStockInsufficient,
  removeCartItem,
  updateCartItemPrice,
} from '../src/ui/sales/sale-cart';

function summary({
  id,
  name = `Product ${id}`,
  variant = null,
  barcode = null,
  price = '1',
  stock = 10,
}: {
  readonly id: string;
  readonly name?: string;
  readonly variant?: string | null;
  readonly barcode?: string | null;
  readonly price?: string;
  readonly stock?: number;
}): ProductSummary {
  return {
    product: createProduct({
      id,
      inventoryId: 'inventory-1',
      name,
      variant,
      barcode,
      regularSalePrice: Money.fromDecimal(price),
      createdAt: 1,
      updatedAt: 1,
    }),
    state: createInventoryState({
      stock,
      unitCost: stock > 0 ? Money.fromDecimal('0.25') : null,
    }),
    isLowStock: false,
  };
}

test('filters products by trimmed case-insensitive name substring', () => {
  const products = [
    summary({ id: 'coca', name: 'Coca-Cola' }),
    summary({ id: 'water', name: 'Agua' }),
  ];

  assert.deepEqual(
    filterSaleProducts(products, '  cOcA  ').map(({ product }) => product.id),
    ['coca'],
  );
});

test('filters products by variant substring', () => {
  const products = [
    summary({ id: 'small', variant: '350 ml' }),
    summary({ id: 'large', variant: '500 ml' }),
  ];

  assert.deepEqual(
    filterSaleProducts(products, '500').map(({ product }) => product.id),
    ['large'],
  );
});

test('matches barcode exactly while preserving leading zeroes', () => {
  const products = [
    summary({ id: 'exact', barcode: '0012345' }),
    summary({ id: 'different', barcode: '12345' }),
  ];

  assert.deepEqual(
    filterSaleProducts(products, '0012345').map(({ product }) => product.id),
    ['exact'],
  );
  assert.deepEqual(
    filterSaleProducts(products, '0012').map(({ product }) => product.id),
    [],
  );
});

test('empty search returns a short recent-created slice in read-model order', () => {
  const products = Array.from({ length: 7 }, (_, index) =>
    summary({ id: `product-${index}` }),
  );

  assert.deepEqual(
    filterSaleProducts(products, '').map(({ product }) => product.id),
    ['product-0', 'product-1', 'product-2', 'product-3', 'product-4'],
  );
});

test('adds a new product as one cart line with quantity one', () => {
  const cart = addProductToCart([], summary({ id: 'coca', price: '0.5' }));

  assert.equal(cart.length, 1);
  assert.equal(cart[0]?.productId, 'coca');
  assert.equal(cart[0]?.quantity, 1);
  assert.equal(cart[0]?.unitSalePrice.scaledUnits, 500_000);
});

test('adding the same product increments one existing line', () => {
  const product = summary({ id: 'coca' });
  const cart = addProductToCart(addProductToCart([], product), product);

  assert.equal(cart.length, 1);
  assert.equal(cart[0]?.quantity, 2);
});

test('adding another product creates a second line', () => {
  const cart = addProductToCart(
    addProductToCart([], summary({ id: 'coca' })),
    summary({ id: 'water' }),
  );

  assert.deepEqual(
    cart.map(({ productId }) => productId),
    ['coca', 'water'],
  );
});

test('cart identity uses productId even when names match', () => {
  const cart = addProductToCart(
    addProductToCart([], summary({ id: 'small', name: 'Coca-Cola' })),
    summary({ id: 'large', name: 'Coca-Cola' }),
  );

  assert.equal(cart.length, 2);
});

test('increments a cart item quantity', () => {
  const cart = addProductToCart([], summary({ id: 'coca' }));

  assert.equal(incrementCartItem(cart, 'coca')[0]?.quantity, 2);
});

test('decrements a cart item quantity above one', () => {
  const product = summary({ id: 'coca' });
  const cart = addProductToCart(addProductToCart([], product), product);

  assert.equal(decrementCartItem(cart, 'coca')[0]?.quantity, 1);
});

test('decrementing quantity one removes the cart line', () => {
  const cart = addProductToCart([], summary({ id: 'coca' }));

  assert.deepEqual(decrementCartItem(cart, 'coca'), []);
});

test('removes a cart item explicitly', () => {
  const cart = addProductToCart(
    addProductToCart([], summary({ id: 'coca' })),
    summary({ id: 'water' }),
  );

  assert.deepEqual(
    removeCartItem(cart, 'coca').map(({ productId }) => productId),
    ['water'],
  );
});

test('calculates one cart item subtotal and total with Money', () => {
  const product = summary({ id: 'coca', price: '0.5' });
  const cart = addProductToCart(addProductToCart([], product), product);

  assert.equal(calculateCartItemSubtotal(cart[0]!).scaledUnits, 1_000_000);
  assert.equal(calculateCartTotal(cart).scaledUnits, 1_000_000);
});

test('calculates a multiple-item total', () => {
  let cart = addProductToCart([], summary({ id: 'coca', price: '0.5' }));
  cart = incrementCartItem(cart, 'coca');
  cart = addProductToCart(cart, summary({ id: 'water', price: '0.75' }));

  assert.equal(calculateCartTotal(cart).scaledUnits, 1_750_000);
});

test('preserves exact six-decimal Money arithmetic', () => {
  const product = summary({ id: 'precise', price: '0.123456' });
  let cart = addProductToCart([], product);
  cart = incrementCartItem(cart, 'precise');
  cart = incrementCartItem(cart, 'precise');

  assert.equal(calculateCartTotal(cart).scaledUnits, 370_368);
});

test('a comma price edit changes the cart total without changing Product', () => {
  const product = summary({ id: 'water', price: '0.75' });
  const originalProductPrice = product.product.regularSalePrice;
  const cart = updateCartItemPrice(
    addProductToCart([], product),
    'water',
    '0,60',
  );

  assert.equal(cart[0]?.unitSalePrice.scaledUnits, 600_000);
  assert.equal(cart[0]?.unitSalePriceText, '0,60');
  assert.equal(cart[0]?.priceError, null);
  assert.equal(calculateCartTotal(cart).scaledUnits, 600_000);
  assert.equal(product.product.regularSalePrice, originalProductPrice);
  assert.equal(product.product.regularSalePrice.scaledUnits, 750_000);
});

test('an invalid price edit keeps text and the last valid Money', () => {
  const cart = updateCartItemPrice(
    addProductToCart([], summary({ id: 'coca', price: '1' })),
    'coca',
    '1,2.3',
  );

  assert.equal(cart[0]?.unitSalePriceText, '1,2.3');
  assert.equal(cart[0]?.unitSalePrice.scaledUnits, 1_000_000);
  assert.equal(cart[0]?.priceError, 'Usa un precio válido.');
});

test('zero sale price remains invalid under the Baseline sale rule', () => {
  const cart = updateCartItemPrice(
    addProductToCart([], summary({ id: 'coca', price: '1' })),
    'coca',
    '0,00',
  );

  assert.equal(cart[0]?.unitSalePriceText, '0,00');
  assert.equal(cart[0]?.unitSalePrice.scaledUnits, 1_000_000);
  assert.equal(cart[0]?.priceError, 'Usa un precio mayor que cero.');
});

test('a Product with zero regular price enters the cart with a price error', () => {
  const cart = addProductToCart(
    [],
    summary({ id: 'free-product', price: '0' }),
  );

  assert.equal(cart[0]?.unitSalePrice.scaledUnits, 0);
  assert.equal(cart[0]?.priceError, 'Usa un precio mayor que cero.');
});

test('marks quantity greater than positive stock as insufficient', () => {
  const product = summary({ id: 'coca', stock: 1 });
  const cart = addProductToCart(addProductToCart([], product), product);

  assert.equal(isCartItemStockInsufficient(cart[0]!), true);
});

test('stock equal to quantity remains sufficient', () => {
  const product = summary({ id: 'coca', stock: 2 });
  const cart = addProductToCart(addProductToCart([], product), product);

  assert.equal(isCartItemStockInsufficient(cart[0]!), false);
  assert.deepEqual(getInsufficientCartItems(cart), []);
});

test('marks any positive quantity with zero stock as insufficient', () => {
  const cart = addProductToCart([], summary({ id: 'water', stock: 0 }));

  assert.equal(isCartItemStockInsufficient(cart[0]!), true);
});

test('marks any positive quantity with negative stock as insufficient', () => {
  const cart = addProductToCart([], summary({ id: 'water', stock: -2 }));

  assert.equal(isCartItemStockInsufficient(cart[0]!), true);
});

test('returns every insufficient cart line and excludes sufficient ones', () => {
  const sufficient = summary({ id: 'coca', stock: 2 });
  let cart = addProductToCart([], sufficient);
  cart = addProductToCart(cart, sufficient);
  cart = addProductToCart(cart, summary({ id: 'water', stock: 0 }));
  cart = addProductToCart(cart, summary({ id: 'chips', stock: -1 }));

  assert.deepEqual(
    getInsufficientCartItems(cart).map(({ productId }) => productId),
    ['water', 'chips'],
  );
});

test('cart is ready only when it has items and every price is valid', () => {
  const validCart = addProductToCart([], summary({ id: 'coca' }));
  const invalidCart = updateCartItemPrice(validCart, 'coca', 'abc');

  assert.equal(isCartReadyToRegister([]), false);
  assert.equal(isCartReadyToRegister(validCart), true);
  assert.equal(isCartReadyToRegister(invalidCart), false);
});

test('summarizes distinct products and total units', () => {
  const coca = summary({ id: 'coca' });
  let cart = addProductToCart([], coca);
  cart = addProductToCart(cart, coca);
  cart = addProductToCart(cart, summary({ id: 'water' }));

  assert.deepEqual(getCartSummary(cart), {
    distinctProducts: 2,
    totalUnits: 3,
  });
});
