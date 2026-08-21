import type { ProductSummary } from '@stock-app/application';
import { Money } from '@stock-app/domain';

import { normalizeMoneyInput } from '../products/product-form-values';

const RECENT_PRODUCT_LIMIT = 5;

export interface SaleCartItem {
  readonly productId: string;
  readonly name: string;
  readonly variant: string | null;
  readonly availableStock: number;
  readonly quantity: number;
  readonly unitSalePrice: Money;
  readonly unitSalePriceText: string;
  readonly priceError: string | null;
}

export interface SaleCartSummary {
  readonly distinctProducts: number;
  readonly totalUnits: number;
}

function requireSafeQuantity(quantity: number): number {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new RangeError('Cart quantity must be a positive safe integer.');
  }

  return quantity;
}

function formatMoneyForInput(money: Money): string {
  const isNegative = money.scaledUnits < 0;
  const magnitude = Math.abs(money.scaledUnits);
  const whole = Math.floor(magnitude / 1_000_000);
  const fraction = String(magnitude % 1_000_000)
    .padStart(6, '0')
    .replace(/0+$/, '');
  const sign = isNegative ? '-' : '';

  return fraction.length === 0
    ? `${sign}${whole}`
    : `${sign}${whole}.${fraction}`;
}

function createCartItem({ product, state }: ProductSummary): SaleCartItem {
  const priceIsPositive = product.regularSalePrice.compare(Money.zero()) > 0;

  return Object.freeze({
    productId: product.id,
    name: product.name,
    variant: product.variant,
    availableStock: state.stock,
    quantity: 1,
    unitSalePrice: product.regularSalePrice,
    unitSalePriceText: formatMoneyForInput(product.regularSalePrice),
    priceError: priceIsPositive ? null : 'Usa un precio mayor que cero.',
  });
}

export function filterSaleProducts(
  products: readonly ProductSummary[],
  query: string,
): readonly ProductSummary[] {
  const normalizedQuery = query.trim();

  if (normalizedQuery.length === 0) {
    return products.slice(0, RECENT_PRODUCT_LIMIT);
  }

  const textQuery = normalizedQuery.toLocaleLowerCase();

  return products.filter(({ product }) => {
    const nameMatches = product.name.toLocaleLowerCase().includes(textQuery);
    const variantMatches =
      product.variant?.toLocaleLowerCase().includes(textQuery) ?? false;
    const barcodeMatches = product.barcode === normalizedQuery;

    return nameMatches || variantMatches || barcodeMatches;
  });
}

export function addProductToCart(
  cart: readonly SaleCartItem[],
  product: ProductSummary,
): readonly SaleCartItem[] {
  const existingItem = cart.find(
    ({ productId }) => productId === product.product.id,
  );

  if (existingItem === undefined) {
    return [...cart, createCartItem(product)];
  }

  return incrementCartItem(cart, product.product.id);
}

export function incrementCartItem(
  cart: readonly SaleCartItem[],
  productId: string,
): readonly SaleCartItem[] {
  return cart.map((item) =>
    item.productId === productId
      ? Object.freeze({
          ...item,
          quantity: requireSafeQuantity(item.quantity + 1),
        })
      : item,
  );
}

export function decrementCartItem(
  cart: readonly SaleCartItem[],
  productId: string,
): readonly SaleCartItem[] {
  const item = cart.find((candidate) => candidate.productId === productId);

  if (item?.quantity === 1) {
    return removeCartItem(cart, productId);
  }

  return cart.map((candidate) =>
    candidate.productId === productId
      ? Object.freeze({
          ...candidate,
          quantity: requireSafeQuantity(candidate.quantity - 1),
        })
      : candidate,
  );
}

export function removeCartItem(
  cart: readonly SaleCartItem[],
  productId: string,
): readonly SaleCartItem[] {
  return cart.filter((item) => item.productId !== productId);
}

export function updateCartItemPrice(
  cart: readonly SaleCartItem[],
  productId: string,
  unitSalePriceText: string,
): readonly SaleCartItem[] {
  const normalizedPrice = normalizeMoneyInput(unitSalePriceText);
  let nextPrice: Money | null = null;
  let priceError: string | null = null;

  if (normalizedPrice === null) {
    priceError = 'Usa un precio válido.';
  } else {
    try {
      const parsedPrice = Money.fromDecimal(normalizedPrice);

      if (parsedPrice.compare(Money.zero()) <= 0) {
        priceError = 'Usa un precio mayor que cero.';
      } else {
        nextPrice = parsedPrice;
      }
    } catch {
      priceError = 'Usa un precio válido.';
    }
  }

  return cart.map((item) =>
    item.productId === productId
      ? Object.freeze({
          ...item,
          unitSalePrice: nextPrice ?? item.unitSalePrice,
          unitSalePriceText,
          priceError,
        })
      : item,
  );
}

export function calculateCartItemSubtotal(item: SaleCartItem): Money {
  return item.unitSalePrice.multiplyByInteger(item.quantity);
}

export function calculateCartTotal(cart: readonly SaleCartItem[]): Money {
  return cart.reduce(
    (total, item) => total.add(calculateCartItemSubtotal(item)),
    Money.zero(),
  );
}

export function isCartItemStockInsufficient(item: SaleCartItem): boolean {
  return item.quantity > item.availableStock;
}

export function getCartSummary(cart: readonly SaleCartItem[]): SaleCartSummary {
  const totalUnits = cart.reduce((total, item) => {
    const nextTotal = total + item.quantity;

    if (!Number.isSafeInteger(nextTotal)) {
      throw new RangeError('Total cart units must be a safe integer.');
    }

    return nextTotal;
  }, 0);

  return Object.freeze({
    distinctProducts: cart.length,
    totalUnits,
  });
}
