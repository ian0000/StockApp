import { createTimestampMs, type TimestampMs } from '@stock-app/domain';

import type { Clock } from './create-product';

export const STOCKAPP_BACKUP_FORMAT = 'stockapp-backup' as const;
export const STOCKAPP_BACKUP_FORMAT_VERSION = 1 as const;
export const STOCKAPP_BACKUP_MIME_TYPE = 'application/json' as const;

export interface BackupInventoryV1 {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface BackupProductV1 {
  readonly id: string;
  readonly inventoryId: string;
  readonly name: string;
  readonly variant: string | null;
  readonly barcode: string | null;
  readonly regularSalePriceUnits: number;
  readonly minimumStock: number | null;
  readonly isArchived: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface BackupInventoryStateV1 {
  readonly inventoryId: string;
  readonly productId: string;
  readonly stock: number;
  readonly unitCostUnits: number | null;
}

export interface BackupInventoryMovementV1 {
  readonly id: string;
  readonly inventoryId: string;
  readonly productId: string;
  readonly type:
    | 'INITIAL_STOCK'
    | 'PURCHASE'
    | 'SALE'
    | 'ADJUSTMENT_IN'
    | 'ADJUSTMENT_OUT'
    | 'REVERSAL';
  readonly quantityDelta: number;
  readonly unitCostSnapshotUnits: number | null;
  readonly stockBefore: number;
  readonly stockAfter: number;
  readonly sourceType: string | null;
  readonly sourceId: string | null;
  readonly metadata: string | null;
  readonly effectiveAt: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface BackupSaleV1 {
  readonly id: string;
  readonly inventoryId: string;
  readonly effectiveAt: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly status: 'CONFIRMED' | 'VOIDED';
  readonly totalAmountUnits: number;
  readonly estimatedCostUnits: number | null;
  readonly estimatedProfitUnits: number | null;
  readonly notes: string | null;
}

export interface BackupSaleItemV1 {
  readonly id: string;
  readonly saleId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly unitSalePriceUnits: number;
  readonly subtotalUnits: number;
  readonly unitCostSnapshotUnits: number | null;
  readonly estimatedCostUnits: number | null;
  readonly estimatedProfitUnits: number | null;
  readonly costStatus: 'KNOWN' | 'UNKNOWN';
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface BackupPurchaseV1 {
  readonly id: string;
  readonly inventoryId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly unitCostUnits: number;
  readonly totalAmountUnits: number;
  readonly effectiveAt: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly status: 'CONFIRMED' | 'VOIDED';
  readonly notes: string | null;
  readonly averageCostBeforeUnits: number | null;
  readonly averageCostAfterUnits: number;
  readonly stockBefore: number;
  readonly stockAfter: number;
}

export interface BackupStockAdjustmentV1 {
  readonly id: string;
  readonly inventoryId: string;
  readonly productId: string;
  readonly stockBefore: number;
  readonly actualStock: number;
  readonly difference: number;
  readonly reason:
    'COUNT_CORRECTION' | 'DAMAGED' | 'LOST' | 'INTERNAL_USE' | 'OTHER';
  readonly costMode: 'USE_CURRENT_COST' | 'CUSTOM_COST' | null;
  readonly unitCostUnits: number;
  readonly effectiveAt: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface BackupDataV1 {
  readonly inventories: readonly BackupInventoryV1[];
  readonly products: readonly BackupProductV1[];
  readonly inventoryStates: readonly BackupInventoryStateV1[];
  readonly inventoryMovements: readonly BackupInventoryMovementV1[];
  readonly sales: readonly BackupSaleV1[];
  readonly saleItems: readonly BackupSaleItemV1[];
  readonly purchases: readonly BackupPurchaseV1[];
  readonly stockAdjustments: readonly BackupStockAdjustmentV1[];
}

export interface StockAppBackupV1 {
  readonly format: typeof STOCKAPP_BACKUP_FORMAT;
  readonly formatVersion: typeof STOCKAPP_BACKUP_FORMAT_VERSION;
  readonly createdAt: TimestampMs;
  readonly inventoryId: string;
  readonly data: BackupDataV1;
}

export interface BackupSnapshotReader {
  readSnapshot(inventoryId: string): Promise<BackupDataV1>;
}

export interface CreateBackupInput {
  readonly inventoryId: string;
}

export interface BackupArtifactMetadata {
  readonly format: typeof STOCKAPP_BACKUP_FORMAT;
  readonly formatVersion: typeof STOCKAPP_BACKUP_FORMAT_VERSION;
  readonly createdAt: TimestampMs;
  readonly inventoryId: string;
}

export interface BackupArtifact {
  readonly fileName: string;
  readonly mimeType: typeof STOCKAPP_BACKUP_MIME_TYPE;
  readonly contents: string;
  readonly metadata: BackupArtifactMetadata;
}

interface CreateBackupDependencies {
  readonly reader: BackupSnapshotReader;
  readonly clock: Clock;
}

export class CreateBackupUseCase {
  constructor(private readonly dependencies: CreateBackupDependencies) {}

  async execute({ inventoryId }: CreateBackupInput): Promise<BackupArtifact> {
    const normalizedInventoryId = requireId(inventoryId, 'Inventory ID');
    const createdAt = createTimestampMs(
      this.dependencies.clock.now(),
      'Backup created at',
    );
    const snapshot = await this.dependencies.reader.readSnapshot(
      normalizedInventoryId,
    );
    const data = prepareBackupData(snapshot, normalizedInventoryId);
    const metadata = Object.freeze({
      format: STOCKAPP_BACKUP_FORMAT,
      formatVersion: STOCKAPP_BACKUP_FORMAT_VERSION,
      createdAt,
      inventoryId: normalizedInventoryId,
    });
    const document: StockAppBackupV1 = Object.freeze({
      ...metadata,
      data,
    });

    return Object.freeze({
      fileName: createBackupFileName(createdAt),
      mimeType: STOCKAPP_BACKUP_MIME_TYPE,
      contents: `${JSON.stringify(document, null, 2)}\n`,
      metadata,
    });
  }
}

function prepareBackupData(
  snapshot: BackupDataV1,
  inventoryId: string,
): BackupDataV1 {
  assertSnapshotIntegrity(snapshot, inventoryId);

  return Object.freeze({
    inventories: sortByCreatedAtAndId(snapshot.inventories),
    products: sortByCreatedAtAndId(snapshot.products),
    inventoryStates: [...snapshot.inventoryStates].sort((left, right) =>
      compareStrings(left.productId, right.productId),
    ),
    inventoryMovements: sortByCreatedAtAndId(snapshot.inventoryMovements),
    sales: sortByCreatedAtAndId(snapshot.sales),
    saleItems: sortByCreatedAtAndId(snapshot.saleItems),
    purchases: sortByCreatedAtAndId(snapshot.purchases),
    stockAdjustments: sortByCreatedAtAndId(snapshot.stockAdjustments),
  });
}

function assertSnapshotIntegrity(
  snapshot: BackupDataV1,
  inventoryId: string,
): void {
  if (
    snapshot.inventories.length !== 1 ||
    snapshot.inventories[0]?.id !== inventoryId
  ) {
    throw new Error(
      'Backup snapshot must contain exactly its requested inventory.',
    );
  }

  const products = new Set<string>();
  for (const product of snapshot.products) {
    requireInventory(product.inventoryId, inventoryId);
    products.add(requireId(product.id, 'Product ID'));
  }

  const stateProducts = new Set<string>();
  for (const state of snapshot.inventoryStates) {
    requireInventory(state.inventoryId, inventoryId);
    requireProduct(state.productId, products);
    if (stateProducts.has(state.productId)) {
      throw new Error('Backup snapshot contains duplicate inventory state.');
    }
    stateProducts.add(state.productId);
  }
  if (stateProducts.size !== products.size) {
    throw new Error('Backup snapshot is missing an inventory state.');
  }

  for (const movement of snapshot.inventoryMovements) {
    requireInventory(movement.inventoryId, inventoryId);
    requireProduct(movement.productId, products);
  }

  const sales = new Set<string>();
  for (const sale of snapshot.sales) {
    requireInventory(sale.inventoryId, inventoryId);
    sales.add(requireId(sale.id, 'Sale ID'));
  }
  for (const item of snapshot.saleItems) {
    requireProduct(item.productId, products);
    if (!sales.has(item.saleId)) {
      throw new Error('Backup snapshot contains an orphan sale item.');
    }
  }
  for (const purchase of snapshot.purchases) {
    requireInventory(purchase.inventoryId, inventoryId);
    requireProduct(purchase.productId, products);
  }
  for (const adjustment of snapshot.stockAdjustments) {
    requireInventory(adjustment.inventoryId, inventoryId);
    requireProduct(adjustment.productId, products);
  }

  assertSafeIntegerValues(snapshot, 'data');
  assertIdentifiers(snapshot, 'data');
  assertTimestamps(snapshot, 'data');
}

function assertSafeIntegerValues(value: unknown, path: string): void {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new RangeError(`${path} must contain only safe integer numbers.`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertSafeIntegerValues(entry, `${path}[${index}]`),
    );
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      assertSafeIntegerValues(entry, `${path}.${key}`);
    }
  }
}

function assertIdentifiers(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertIdentifiers(entry, `${path}[${index}]`),
    );
    return;
  }
  if (value === null || typeof value !== 'object') {
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if ((key === 'id' || key.endsWith('Id')) && entry !== null) {
      if (typeof entry !== 'string' || entry.trim().length === 0) {
        throw new TypeError(`${path}.${key} must be a non-empty text ID.`);
      }
    }
    assertIdentifiers(entry, `${path}.${key}`);
  }
}

function assertTimestamps(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertTimestamps(entry, `${path}[${index}]`),
    );
    return;
  }
  if (value === null || typeof value !== 'object') {
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (key.endsWith('At') && (typeof entry !== 'number' || entry < 0)) {
      throw new RangeError(`${path}.${key} must be a non-negative timestamp.`);
    }
    assertTimestamps(entry, `${path}.${key}`);
  }
}

function requireInventory(actual: string, expected: string): void {
  if (actual !== expected) {
    throw new Error('Backup snapshot contains data from another inventory.');
  }
}

function requireProduct(
  productId: string,
  products: ReadonlySet<string>,
): void {
  if (!products.has(productId)) {
    throw new Error('Backup snapshot contains an orphan product reference.');
  }
}

function requireId(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new TypeError(`${label} cannot be empty.`);
  }
  return normalized;
}

function sortByCreatedAtAndId<T extends { createdAt: number; id: string }>(
  values: readonly T[],
): readonly T[] {
  return [...values].sort(
    (left, right) =>
      left.createdAt - right.createdAt || compareStrings(left.id, right.id),
  );
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function createBackupFileName(createdAt: TimestampMs): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(
      'Backup created at is outside the supported date range.',
    );
  }
  const instant = date.toISOString();
  const compact = `${instant.slice(0, 10)}-${instant.slice(11, 19).replaceAll(':', '')}`;
  return `stockapp-backup-${compact}.json`;
}
