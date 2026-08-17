import { Money } from '../money/index';

export type InventoryMovementType =
  | 'INITIAL_STOCK'
  | 'PURCHASE'
  | 'SALE'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT'
  | 'REVERSAL';

export interface InventoryMovement {
  readonly type: InventoryMovementType;
  readonly quantityDelta: number;
  readonly unitCost: Money | null;
}

export interface CreateInventoryMovementInput {
  readonly type: InventoryMovementType;
  readonly quantityDelta: number;
  readonly unitCost: Money | null;
}

export interface CreatePurchaseMovementInput {
  readonly quantity: number;
  readonly unitCost: Money;
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

export function createInventoryMovement({
  type,
  quantityDelta,
  unitCost,
}: CreateInventoryMovementInput): InventoryMovement {
  requireSafeInteger(quantityDelta, 'Quantity delta');

  if (quantityDelta === 0) {
    throw new RangeError('Quantity delta must be non-zero.');
  }

  if (unitCost !== null && unitCost.compare(Money.zero()) < 0) {
    throw new RangeError('Movement unit cost must not be negative.');
  }

  return Object.freeze({ type, quantityDelta, unitCost });
}

export function createPurchaseMovement({
  quantity,
  unitCost,
}: CreatePurchaseMovementInput): InventoryMovement {
  requireSafeInteger(quantity, 'Purchase quantity');

  if (quantity <= 0) {
    throw new RangeError('Purchase quantity must be greater than zero.');
  }

  return createInventoryMovement({
    type: 'PURCHASE',
    quantityDelta: quantity,
    unitCost,
  });
}

export function createInitialStockMovement({
  quantity,
  unitCost,
}: CreateInitialStockMovementInput): InventoryMovement {
  requireSafeInteger(quantity, 'Initial stock quantity');

  if (quantity <= 0) {
    throw new RangeError('Initial stock quantity must be greater than zero.');
  }

  return createInventoryMovement({
    type: 'INITIAL_STOCK',
    quantityDelta: quantity,
    unitCost,
  });
}
