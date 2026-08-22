import { applyPurchase } from '../inventory/index';
import { Money } from '../money/index';
import { createTimestampMs, type TimestampMs } from '../timestamp/index';

export type PurchaseStatus = 'CONFIRMED' | 'VOIDED';

export interface Purchase {
  readonly id: string;
  readonly inventoryId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly unitCost: Money;
  readonly totalAmount: Money;
  readonly effectiveAt: TimestampMs;
  readonly createdAt: TimestampMs;
  readonly updatedAt: TimestampMs;
  readonly status: PurchaseStatus;
  readonly notes: string | null;
  readonly averageCostBefore: Money | null;
  readonly averageCostAfter: Money;
  readonly stockBefore: number;
  readonly stockAfter: number;
}

export interface CreatePurchaseInput {
  readonly id: string;
  readonly inventoryId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly unitCost: Money;
  readonly totalAmount: Money;
  readonly effectiveAt: TimestampMs;
  readonly createdAt: TimestampMs;
  readonly updatedAt: TimestampMs;
  readonly status: PurchaseStatus;
  readonly notes?: string | null;
  readonly averageCostBefore: Money | null;
  readonly averageCostAfter: Money;
  readonly stockBefore: number;
  readonly stockAfter: number;
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

function normalizeNotes(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new TypeError('Purchase notes must be a string or null.');
  }

  const normalized = value.trim();

  return normalized.length === 0 ? null : normalized;
}

function requireSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer.`);
  }

  return value;
}

function validateStatus(status: PurchaseStatus): void {
  if (status !== 'CONFIRMED' && status !== 'VOIDED') {
    throw new RangeError('Purchase status must be CONFIRMED or VOIDED.');
  }
}

function validateSnapshots({
  quantity,
  unitCost,
  totalAmount,
  averageCostBefore,
  averageCostAfter,
  stockBefore,
  stockAfter,
}: Pick<
  CreatePurchaseInput,
  | 'quantity'
  | 'unitCost'
  | 'totalAmount'
  | 'averageCostBefore'
  | 'averageCostAfter'
  | 'stockBefore'
  | 'stockAfter'
>): void {
  requireSafeInteger(quantity, 'Purchase quantity');

  if (quantity <= 0) {
    throw new RangeError('Purchase quantity must be greater than zero.');
  }

  if (unitCost.compare(Money.zero()) < 0) {
    throw new RangeError('Purchase unit cost must not be negative.');
  }

  const expectedTotal = unitCost.multiplyByInteger(quantity);

  if (!totalAmount.equals(expectedTotal)) {
    throw new RangeError(
      'Purchase total amount must equal unit cost times quantity.',
    );
  }

  const normalizedStockBefore = requireSafeInteger(stockBefore, 'Stock before');
  const normalizedStockAfter = requireSafeInteger(stockAfter, 'Stock after');
  const calculatedStockAfter = normalizedStockBefore + quantity;

  if (!Number.isSafeInteger(calculatedStockAfter)) {
    throw new RangeError('Resulting stock must be a safe integer.');
  }

  if (normalizedStockAfter !== calculatedStockAfter) {
    throw new RangeError(
      'Stock after must equal stock before plus purchase quantity.',
    );
  }

  const expectedState = applyPurchase({
    inventory: {
      stock: normalizedStockBefore,
      unitCost: averageCostBefore,
    },
    quantity,
    unitCost,
  });

  if (
    expectedState.unitCost === null ||
    !averageCostAfter.equals(expectedState.unitCost)
  ) {
    throw new RangeError(
      'Average cost after must match the approved purchase rules.',
    );
  }
}

export function createPurchase({
  id,
  inventoryId,
  productId,
  quantity,
  unitCost,
  totalAmount,
  effectiveAt,
  createdAt,
  updatedAt,
  status,
  notes,
  averageCostBefore,
  averageCostAfter,
  stockBefore,
  stockAfter,
}: CreatePurchaseInput): Purchase {
  validateStatus(status);
  validateSnapshots({
    quantity,
    unitCost,
    totalAmount,
    averageCostBefore,
    averageCostAfter,
    stockBefore,
    stockAfter,
  });

  const normalizedCreatedAt = createTimestampMs(createdAt, 'Created at');
  const normalizedUpdatedAt = createTimestampMs(updatedAt, 'Updated at');

  if (normalizedUpdatedAt < normalizedCreatedAt) {
    throw new RangeError('Updated at must not be before created at.');
  }

  return Object.freeze({
    id: normalizeRequiredIdentifier(id, 'Purchase ID'),
    inventoryId: normalizeRequiredIdentifier(inventoryId, 'Inventory ID'),
    productId: normalizeRequiredIdentifier(productId, 'Product ID'),
    quantity,
    unitCost,
    totalAmount,
    effectiveAt: createTimestampMs(effectiveAt, 'Effective at'),
    createdAt: normalizedCreatedAt,
    updatedAt: normalizedUpdatedAt,
    status,
    notes: normalizeNotes(notes),
    averageCostBefore,
    averageCostAfter,
    stockBefore,
    stockAfter,
  });
}
