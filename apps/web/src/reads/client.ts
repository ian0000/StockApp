import type { HistoryPage } from '@stock-app/contracts';
import { ApiClientError, type createApiClient } from '../api/client.js';
import validateDashboard from '../api/generated/dashboard.mjs';
import validateHistory from '../api/generated/history-page.mjs';

export function createReadsClient(api: ReturnType<typeof createApiClient>) {
  const prefix = (id: string) => `/v1/inventories/${encodeURIComponent(id)}`;
  return {
    async dashboard(inventoryId: string, signal: AbortSignal) {
      const response = await api.request(`${prefix(inventoryId)}/dashboard`, {
        signal,
      });
      if (
        response.status !== 200 ||
        !validateDashboard(response.body) ||
        response.body.fromInclusive >= response.body.toExclusive ||
        response.body.lowStock.length > 2 ||
        response.body.recent.length > 5 ||
        !response.body.lowStock.every(
          ({ product, state, isLowStock }) =>
            isLowStock &&
            !product.isArchived &&
            product.inventoryId.toLowerCase() === inventoryId.toLowerCase() &&
            state.inventoryId.toLowerCase() === inventoryId.toLowerCase() &&
            state.productId.toLowerCase() === product.id.toLowerCase(),
        )
      )
        throw new ApiClientError('INVALID_JSON', response.status);
      return response.body;
    },
    async history(
      inventoryId: string,
      cursor: string | null,
      signal: AbortSignal,
    ) {
      const query = new URLSearchParams({ limit: '50' });
      if (cursor !== null) query.set('cursor', cursor);
      const response = await api.request(
        `${prefix(inventoryId)}/history?${query}`,
        { signal },
      );
      if (
        response.status !== 200 ||
        !validateHistory(response.body) ||
        response.body.items.length > 50
      )
        throw new ApiClientError('INVALID_JSON', response.status);
      return response.body;
    },
  };
}
export type ReadsClient = ReturnType<typeof createReadsClient>;
export function uniqueHistory(pages: readonly HistoryPage[]) {
  const seen = new Set<string>();
  return pages
    .flatMap((page) => page.items)
    .filter((item) => {
      const key = `${item.type}/${item.id.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
