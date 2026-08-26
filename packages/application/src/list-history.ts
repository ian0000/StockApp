import type {
  AdjustmentReason,
  Money,
  PurchaseStatus,
  SaleStatus,
  TimestampMs,
} from '@stock-app/domain';

export interface SaleHistoryEntry {
  readonly type: 'SALE';
  readonly id: string;
  readonly totalAmount: Money;
  readonly units: number;
  readonly status: SaleStatus;
  readonly effectiveAt: TimestampMs;
  readonly createdAt: TimestampMs;
}

export interface PurchaseHistoryEntry {
  readonly type: 'PURCHASE';
  readonly id: string;
  readonly productId: string;
  readonly productName: string;
  readonly productVariant: string | null;
  readonly quantity: number;
  readonly unitCost: Money;
  readonly totalAmount: Money;
  readonly status: PurchaseStatus;
  readonly effectiveAt: TimestampMs;
  readonly createdAt: TimestampMs;
}

export interface StockAdjustmentHistoryEntry {
  readonly type: 'ADJUSTMENT';
  readonly id: string;
  readonly productId: string;
  readonly productName: string;
  readonly productVariant: string | null;
  readonly difference: number;
  readonly reason: AdjustmentReason;
  readonly effectiveAt: TimestampMs;
  readonly createdAt: TimestampMs;
}

export type HistoryEntry =
  SaleHistoryEntry | PurchaseHistoryEntry | StockAdjustmentHistoryEntry;

export interface ListHistoryInput {
  readonly inventoryId: string;
  readonly limit?: number;
}

export interface ListHistoryReaderInput {
  readonly inventoryId: string;
  readonly limit: number;
}

export interface HistoryReader {
  listRecent(input: ListHistoryReaderInput): Promise<readonly HistoryEntry[]>;
}

export const DEFAULT_HISTORY_LIMIT = 50;
export const MAX_HISTORY_LIMIT = 50;

function normalizeInventoryId(inventoryId: string): string {
  if (typeof inventoryId !== 'string') {
    throw new TypeError('Inventory ID must be a string.');
  }

  const normalized = inventoryId.trim();

  if (normalized.length === 0) {
    throw new TypeError('Inventory ID must not be empty.');
  }

  return normalized;
}

function normalizeLimit(limit: number | undefined): number {
  const normalized = limit ?? DEFAULT_HISTORY_LIMIT;

  if (!Number.isSafeInteger(normalized)) {
    throw new RangeError('History limit must be a safe integer.');
  }

  if (normalized <= 0 || normalized > MAX_HISTORY_LIMIT) {
    throw new RangeError(
      `History limit must be between 1 and ${MAX_HISTORY_LIMIT}.`,
    );
  }

  return normalized;
}

function compareDescendingNumber(left: number, right: number): number {
  if (left === right) return 0;
  return left < right ? 1 : -1;
}

export function compareHistoryEntriesNewestFirst(
  left: HistoryEntry,
  right: HistoryEntry,
): number {
  const effectiveAtComparison = compareDescendingNumber(
    left.effectiveAt,
    right.effectiveAt,
  );

  if (effectiveAtComparison !== 0) return effectiveAtComparison;

  const createdAtComparison = compareDescendingNumber(
    left.createdAt,
    right.createdAt,
  );

  if (createdAtComparison !== 0) return createdAtComparison;
  if (left.id === right.id) return 0;

  return left.id < right.id ? 1 : -1;
}

export class ListHistoryUseCase {
  constructor(private readonly reader: HistoryReader) {}

  async execute({
    inventoryId,
    limit,
  }: ListHistoryInput): Promise<readonly HistoryEntry[]> {
    return this.reader.listRecent(
      Object.freeze({
        inventoryId: normalizeInventoryId(inventoryId),
        limit: normalizeLimit(limit),
      }),
    );
  }
}
