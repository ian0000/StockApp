import { queryOptions } from '@tanstack/react-query';
import type { CommandScope } from '../commands/scope.js';
import type { SalesClient } from './client.js';
import { salesKey } from './controller.js';
export function saleDetailOptions(
  client: SalesClient,
  scope: CommandScope,
  saleId: string,
) {
  return queryOptions({
    queryKey: salesKey(scope, 'detail', saleId.toLowerCase()),
    retryOnMount: false,
    queryFn: ({ signal }) => client.detail(scope.inventoryId, saleId, signal),
  });
}
