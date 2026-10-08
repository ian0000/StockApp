import {
  clearDescriptor,
  readDescriptor,
  writeDescriptor,
  type PendingCommand,
  type PendingStorage,
} from '../commands/pending.js';
export const PENDING_PRODUCT_KEY = 'stockapp.pending-product';
export const PRODUCT_COMMAND_KINDS = [
  'PRODUCT_CREATE',
  'PRODUCT_UPDATE',
  'PRODUCT_ARCHIVE',
] as const;
export type PendingProduct = PendingCommand<
  (typeof PRODUCT_COMMAND_KINDS)[number]
>;
export type { PendingStorage } from '../commands/pending.js';
export const readPending = (storage: PendingStorage) =>
  readDescriptor(storage, PENDING_PRODUCT_KEY, PRODUCT_COMMAND_KINDS);
export const clearPending = (storage: PendingStorage) =>
  clearDescriptor(storage, PENDING_PRODUCT_KEY);
export const writePending = (
  storage: PendingStorage,
  descriptor: PendingProduct,
) => writeDescriptor(storage, PENDING_PRODUCT_KEY, descriptor);
