import { Money } from '../money/index';
import { createTimestampMs, type TimestampMs } from '../timestamp/index';

export type InventoryMovementType =
  | 'INITIAL_STOCK'
  | 'PURCHASE'
  | 'SALE'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT'
  | 'REVERSAL';

export interface InventoryMovementDraft {
  readonly type: InventoryMovementType;
  readonly quantityDelta: number;
  readonly unitCostSnapshot: Money | null;
  readonly stockBefore: number;
  readonly stockAfter: number;
  readonly sourceType: string | null;
  readonly sourceId: string | null;
  readonly metadata: null;
}

export interface InventoryMovement extends InventoryMovementDraft {
  readonly id: string;
  readonly inventoryId: string;
  readonly productId: string;
  readonly effectiveAt: TimestampMs;
  readonly createdAt: TimestampMs;
  readonly updatedAt: TimestampMs;
}

export interface CreateInventoryMovementDraftInput {
  readonly type: InventoryMovementType;
  readonly quantityDelta: number;
  readonly unitCostSnapshot: Money | null;
  readonly stockBefore: number;
  readonly stockAfter: number;
  readonly sourceType: string | null;
  readonly sourceId: string | null;
  readonly metadata?: null;
}

export interface CreateInventoryMovementInput extends CreateInventoryMovementDraftInput {
  readonly id: string;
  readonly inventoryId: string;
  readonly productId: string;
  readonly effectiveAt: TimestampMs;
  readonly createdAt: TimestampMs;
  readonly updatedAt: TimestampMs;
}

export interface CreatePurchaseMovementInput {
  readonly purchaseId: string;
  readonly quantity: number;
  readonly unitCost: Money;
  readonly stockBefore: number;
}

export interface CreateInitialStockMovementInput {
  readonly quantity: number;
  readonly unitCost: Money;
}

function requireSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer.`);
  }

  return value;
}

function normalizeRequiredIdentifier(value: string, label: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${label} must be a string.`);
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new TypeError(`${label} must not be empty.`);
  }

  return normalized;
}

function normalizeOptionalIdentifier(
  value: string | null,
  label: string,
): string | null {
  return value === null ? null : normalizeRequiredIdentifier(value, label);
}

export function createInventoryMovementDraft({
  type,
  quantityDelta,
  unitCostSnapshot,
  stockBefore,
  stockAfter,
  sourceType,
  sourceId,
  metadata = null,
}: CreateInventoryMovementDraftInput): InventoryMovementDraft {
  requireSafeInteger(quantityDelta, 'Quantity delta');

  if (quantityDelta === 0) {
    throw new RangeError('Quantity delta must be non-zero.');
  }

  if (unitCostSnapshot !== null && unitCostSnapshot.compare(Money.zero()) < 0) {
    throw new RangeError('Movement cost snapshot must not be negative.');
  }

  const normalizedStockBefore = requireSafeInteger(stockBefore, 'Stock before');
  const normalizedStockAfter = requireSafeInteger(stockAfter, 'Stock after');
  const calculatedStockAfter = normalizedStockBefore + quantityDelta;

  if (!Number.isSafeInteger(calculatedStockAfter)) {
    throw new RangeError('Stock calculation must be a safe integer.');
  }

  if (calculatedStockAfter !== normalizedStockAfter) {
    throw new RangeError(
      'Stock after must equal stock before plus quantity delta.',
    );
  }

  const normalizedSourceType = normalizeOptionalIdentifier(
    sourceType,
    'Source type',
  );
  const normalizedSourceId = normalizeOptionalIdentifier(sourceId, 'Source ID');

  if ((normalizedSourceType === null) !== (normalizedSourceId === null)) {
    throw new RangeError(
      'Source type and source ID must be provided together.',
    );
  }

  if (metadata !== null) {
    throw new TypeError('Movement metadata must be null in V1.');
  }

  return Object.freeze({
    type,
    quantityDelta,
    unitCostSnapshot,
    stockBefore: normalizedStockBefore,
    stockAfter: normalizedStockAfter,
    sourceType: normalizedSourceType,
    sourceId: normalizedSourceId,
    metadata: null,
  });
}

export function createInventoryMovement({
  id,
  inventoryId,
  productId,
  effectiveAt,
  createdAt,
  updatedAt,
  ...draftInput
}: CreateInventoryMovementInput): InventoryMovement {
  const draft = createInventoryMovementDraft(draftInput);
  const normalizedCreatedAt = createTimestampMs(createdAt, 'Created at');
  const normalizedUpdatedAt = createTimestampMs(updatedAt, 'Updated at');

  if (normalizedUpdatedAt < normalizedCreatedAt) {
    throw new RangeError('Updated at must not be before created at.');
  }

  return Object.freeze({
    id: normalizeRequiredIdentifier(id, 'Movement ID'),
    inventoryId: normalizeRequiredIdentifier(inventoryId, 'Inventory ID'),
    productId: normalizeRequiredIdentifier(productId, 'Product ID'),
    ...draft,
    effectiveAt: createTimestampMs(effectiveAt, 'Effective at'),
    createdAt: normalizedCreatedAt,
    updatedAt: normalizedUpdatedAt,
  });
}

export function createPurchaseMovement({
  purchaseId,
  quantity,
  unitCost,
  stockBefore,
}: CreatePurchaseMovementInput): InventoryMovementDraft {
  requireSafeInteger(quantity, 'Purchase quantity');

  if (quantity <= 0) {
    throw new RangeError('Purchase quantity must be greater than zero.');
  }

  requireSafeInteger(stockBefore, 'Stock before');
  const stockAfter = stockBefore + quantity;

  if (!Number.isSafeInteger(stockAfter)) {
    throw new RangeError('Stock calculation must be a safe integer.');
  }

  return createInventoryMovementDraft({
    type: 'PURCHASE',
    quantityDelta: quantity,
    unitCostSnapshot: unitCost,
    stockBefore,
    stockAfter,
    sourceType: 'PURCHASE',
    sourceId: purchaseId,
    metadata: null,
  });
}

export function createInitialStockMovement({
  quantity,
  unitCost,
}: CreateInitialStockMovementInput): InventoryMovementDraft {
  requireSafeInteger(quantity, 'Initial stock quantity');

  if (quantity <= 0) {
    throw new RangeError('Initial stock quantity must be greater than zero.');
  }

  return createInventoryMovementDraft({
    type: 'INITIAL_STOCK',
    quantityDelta: quantity,
    unitCostSnapshot: unitCost,
    stockBefore: 0,
    stockAfter: quantity,
    sourceType: null,
    sourceId: null,
    metadata: null,
  });
}
