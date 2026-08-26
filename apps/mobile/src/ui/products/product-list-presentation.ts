import type { ListProductsInput, ProductSummary } from '@stock-app/application';

import { formatMoneyForDisplay } from './product-form-values';

export type ProductsState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly products: readonly ProductSummary[] }
  | { readonly status: 'error' };

export type ProductsContentKind = 'loading' | 'empty' | 'error' | 'ready';
export type ProductStockStatus = 'positive' | 'zero' | 'negative';

export interface ProductListRowPresentation {
  readonly name: string;
  readonly variant: string | null;
  readonly stockLabel: string;
  readonly stockStatus: ProductStockStatus;
  readonly priceLabel: string;
}

export function createProductListRequest(
  inventoryId: string,
): ListProductsInput {
  return Object.freeze({ inventoryId });
}

export function getProductsContentKind(
  state: ProductsState,
): ProductsContentKind {
  if (state.status !== 'ready') return state.status;
  return state.products.length === 0 ? 'empty' : 'ready';
}

function getStockStatus(stock: number): ProductStockStatus {
  if (stock < 0) return 'negative';
  return stock === 0 ? 'zero' : 'positive';
}

export function createProductListRowPresentation(
  { product, state }: ProductSummary,
  currency: string,
): ProductListRowPresentation {
  return Object.freeze({
    name: product.name,
    variant: product.variant,
    stockLabel: `${state.stock} unidades`,
    stockStatus: getStockStatus(state.stock),
    priceLabel: formatMoneyForDisplay(product.regularSalePrice, currency),
  });
}
