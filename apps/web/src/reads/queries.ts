import {
  infiniteQueryOptions,
  queryOptions,
  type QueryClient,
} from '@tanstack/react-query';
import { scopedKey, type CommandScope } from '../commands/scope.js';
import type { ReadsClient } from './client.js';
export const dashboardKey = (scope: CommandScope) =>
  scopedKey(scope, 'dashboard');
export const historyKey = (scope: CommandScope) => scopedKey(scope, 'history');
export function dashboardOptions(client: ReadsClient, scope: CommandScope) {
  return queryOptions({
    queryKey: dashboardKey(scope),
    retryOnMount: false,
    queryFn: ({ signal }) => client.dashboard(scope.inventoryId, signal),
  });
}
export function historyOptions(client: ReadsClient, scope: CommandScope) {
  return infiniteQueryOptions({
    queryKey: historyKey(scope),
    retryOnMount: false,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      client.history(scope.inventoryId, pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}
export async function invalidateCommercialReads(
  queries: QueryClient,
  scope: CommandScope,
) {
  await queries.invalidateQueries({ queryKey: dashboardKey(scope) });
  await queries.invalidateQueries({ queryKey: historyKey(scope) });
}
