import type { InventoryState } from '../inventory/index';

import type { Product } from './product';

export function isProductLowStock(
  product: Pick<Product, 'isArchived' | 'minimumStock'>,
  state: Pick<InventoryState, 'stock'>,
): boolean {
  return (
    !product.isArchived &&
    product.minimumStock !== null &&
    state.stock <= product.minimumStock
  );
}
