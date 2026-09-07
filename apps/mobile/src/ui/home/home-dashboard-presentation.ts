import type { ProductSummary, TopSellingProduct } from '@stock-app/application';

import { createProductDetailsRoute } from '../products/product-details-presentation';

export const PRODUCTS_TAB_ROUTE = '/products' as const;

export type HomeBlockState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: T | null }
  | { readonly status: 'error' };

export type HomeBlockContentKind = 'loading' | 'empty' | 'error' | 'ready';

export function getHomeBlockContentKind<T>(
  state: HomeBlockState<T>,
): HomeBlockContentKind {
  if (state.status !== 'ready') return state.status;
  return state.value === null ? 'empty' : 'ready';
}

export function createHomeLowStockPresentation(
  products: readonly Pick<ProductSummary, 'isLowStock' | 'product' | 'state'>[],
) {
  const lowStockProducts = products.filter(({ isLowStock }) => isLowStock);
  const count = lowStockProducts.length;

  return Object.freeze({
    count,
    message:
      count === 0
        ? 'Todo bien por ahora'
        : count === 1
          ? '1 producto necesita atención'
          : `${count} productos necesitan atención`,
    preview: Object.freeze(
      lowStockProducts.slice(0, 2).map(({ product, state }) =>
        Object.freeze({
          productId: product.id,
          name: product.name,
          variant: product.variant,
          stockLabel: `${state.stock} unidades`,
        }),
      ),
    ),
  });
}

export function createTopSellingProductPresentation(
  product: TopSellingProduct,
) {
  return Object.freeze({
    name: product.name,
    variant: product.variant,
    unitsLabel:
      product.unitsSold === 1
        ? '1 unidad vendida hoy'
        : `${product.unitsSold} unidades vendidas hoy`,
    route: createProductDetailsRoute(product.productId),
  });
}
