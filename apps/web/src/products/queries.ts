import { infiniteQueryOptions } from '@tanstack/react-query';
import type { ProductsClient } from './client.js';
import { productsKey, type ProductScope } from './controller.js';

export function productListOptions(
  client: ProductsClient,
  scope: ProductScope,
  search: string,
) {
  return infiniteQueryOptions({
    queryKey: productsKey(scope, 'list', search),
    initialPageParam: null as string | null,
    retryOnMount: false,
    queryFn: ({ pageParam, signal }) =>
      client.page(scope.inventoryId, search, pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}
