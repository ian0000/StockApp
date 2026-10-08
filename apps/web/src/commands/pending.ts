import { decodeUuid } from '@stock-app/contracts/transport';
export type PendingStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
>;
export type PendingCommand<K extends string> = {
  operationId: string;
  inventoryId: string;
  commandKind: K;
};
export function clearDescriptor(storage: PendingStorage, key: string) {
  try {
    storage.removeItem(key);
  } catch {
    /* No commercial payload fallback. */
  }
}
export function readDescriptor<K extends string>(
  storage: PendingStorage,
  key: string,
  kinds: readonly K[],
): PendingCommand<K> | null {
  try {
    const text = storage.getItem(key);
    if (text === null) return null;
    const value: unknown = JSON.parse(text);
    const validKind = (kind: unknown): kind is K =>
      kinds.some((allowed) => allowed === kind);
    if (
      !value ||
      typeof value !== 'object' ||
      Object.keys(value).sort().join(',') !==
        'commandKind,inventoryId,operationId' ||
      !('operationId' in value) ||
      !('inventoryId' in value) ||
      !('commandKind' in value) ||
      !validKind(value.commandKind)
    )
      throw new TypeError();
    return {
      operationId: decodeUuid(value.operationId, 7),
      inventoryId: decodeUuid(value.inventoryId),
      commandKind: value.commandKind,
    };
  } catch {
    clearDescriptor(storage, key);
    return null;
  }
}
export function writeDescriptor<K extends string>(
  storage: PendingStorage,
  key: string,
  descriptor: PendingCommand<K>,
) {
  storage.setItem(
    key,
    JSON.stringify({
      operationId: descriptor.operationId,
      inventoryId: descriptor.inventoryId,
      commandKind: descriptor.commandKind,
    }),
  );
}
