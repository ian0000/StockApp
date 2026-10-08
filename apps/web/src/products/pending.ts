import { decodeUuid } from '@stock-app/contracts/transport';

export const PENDING_PRODUCT_KEY = 'stockapp.pending-product';
export type PendingProduct = {
  operationId: string;
  inventoryId: string;
  commandKind: 'PRODUCT_CREATE';
};
export type PendingStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
>;
export function readPending(storage: PendingStorage): PendingProduct | null {
  try {
    const text = storage.getItem(PENDING_PRODUCT_KEY);
    if (text === null) return null;
    const value: unknown = JSON.parse(text);
    if (
      !value ||
      typeof value !== 'object' ||
      Object.keys(value).sort().join(',') !==
        'commandKind,inventoryId,operationId' ||
      !('operationId' in value) ||
      !('inventoryId' in value) ||
      !('commandKind' in value) ||
      value.commandKind !== 'PRODUCT_CREATE'
    )
      throw new TypeError();
    return {
      operationId: decodeUuid(value.operationId, 7),
      inventoryId: decodeUuid(value.inventoryId),
      commandKind: value.commandKind,
    };
  } catch {
    clearPending(storage);
    return null;
  }
}
export function clearPending(storage: PendingStorage) {
  try {
    storage.removeItem(PENDING_PRODUCT_KEY);
  } catch {
    /* Storage may be unavailable; no payload fallback. */
  }
}
export function writePending(
  storage: PendingStorage,
  descriptor: PendingProduct,
) {
  // Explicit allowlist even if a caller holds a richer in-memory object.
  storage.setItem(
    PENDING_PRODUCT_KEY,
    JSON.stringify({
      operationId: descriptor.operationId,
      inventoryId: descriptor.inventoryId,
      commandKind: 'PRODUCT_CREATE',
    }),
  );
}
