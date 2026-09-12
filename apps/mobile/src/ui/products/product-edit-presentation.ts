import type { ProductDetails } from '@stock-app/application';
import type { Money } from '@stock-app/domain';

import {
  formatMoneyForInput,
  parseEditableProductFormValues,
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
): ProductEditValues {
  return Object.freeze({
    name: details.name,
    variant: details.variant ?? '',
    barcode: details.barcode ?? '',
    regularSalePrice: formatMoneyForInput(details.regularSalePrice),
    originalRegularSalePrice: details.regularSalePrice,
    isPriceDirty: false,
    minimumStock:
      details.minimumStock === null ? '' : String(details.minimumStock),
  });
}

export interface ProductEditValues extends EditableProductFormValues {
  readonly originalRegularSalePrice: Money;
  readonly isPriceDirty: boolean;
}

export function updateProductEditValue<
  Key extends keyof EditableProductFormValues,
>(
  values: ProductEditValues,
  key: Key,
  value: EditableProductFormValues[Key],
): ProductEditValues {
  return {
    ...values,
    [key]: value,
    isPriceDirty: values.isPriceDirty || key === 'regularSalePrice',
  };
}

export function parseProductEditValues(values: ProductEditValues) {
  return parseEditableProductFormValues(
    values,
    values.isPriceDirty ? undefined : values.originalRegularSalePrice,
  );
}

export function getProductEditContentKind(
  state: ProductEditState,
): ProductEditContentKind {
  if (state.status !== 'ready') return state.status;
  return state.details === null ? 'not-found' : 'loaded';
}
