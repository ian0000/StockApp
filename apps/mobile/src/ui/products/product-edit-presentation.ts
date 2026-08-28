import type { ProductDetails } from '@stock-app/application';

import {
  formatMoneyForInput,
  type EditableProductFormValues,
} from './product-form-values';

export type ProductEditState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly details: ProductDetails | null }
  | { readonly status: 'error' };

export type ProductEditContentKind =
  'loading' | 'loaded' | 'not-found' | 'error';

export function createProductEditRoute(productId: string) {
  return Object.freeze({
    pathname: '/product/edit/[id]' as const,
    params: Object.freeze({ id: productId }),
  });
}

export function createInitialProductEditValues(
  details: ProductDetails,
): EditableProductFormValues {
  return Object.freeze({
    name: details.name,
    variant: details.variant ?? '',
    barcode: details.barcode ?? '',
    regularSalePrice: formatMoneyForInput(details.regularSalePrice),
    minimumStock:
      details.minimumStock === null ? '' : String(details.minimumStock),
  });
}

export function getProductEditContentKind(
  state: ProductEditState,
): ProductEditContentKind {
  if (state.status !== 'ready') return state.status;
  return state.details === null ? 'not-found' : 'loaded';
}
