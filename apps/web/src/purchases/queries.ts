import { queryOptions } from '@tanstack/react-query';
import type { CommandScope } from '../commands/scope.js';
import type { PurchasesClient } from './client.js';
import { purchasesKey } from './controller.js';
export const purchaseDetailOptions = (
  client: PurchasesClient,
  scope: CommandScope,
  id: string,
) =>
  queryOptions({
    queryKey: purchasesKey(scope, 'detail', id.toLowerCase()),
    retryOnMount: false,
    queryFn: ({ signal }) => client.detail(scope.inventoryId, id, signal),
  });
