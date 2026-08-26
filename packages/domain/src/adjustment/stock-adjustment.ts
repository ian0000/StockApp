import {
  applyPurchase,
  createInventoryState,
  type InventoryState,
} from '../inventory/index';
import { Money } from '../money/index';
import { createTimestampMs, type TimestampMs } from '../timestamp/index';

export type AdjustmentReason =
  'COUNT_CORRECTION' | 'DAMAGED' | 'LOST' | 'INTERNAL_USE' | 'OTHER';

export type AdjustmentCostMode = 'USE_CURRENT_COST' | 'CUSTOM_COST';

export interface StockAdjustment {
  readonly id: string;
  readonly inventoryId: string;
  readonly productId: string;
  readonly stockBefore: number;
  readonly actualStock: number;
  readonly difference: number;
  readonly reason: AdjustmentReason;
  readonly costMode: AdjustmentCostMode | null;
  readonly unitCost: Money | null;
  readonly effectiveAt: TimestampMs;
  readonly createdAt: TimestampMs;
  readonly updatedAt: TimestampMs;
}

export type CreateStockAdjustmentInput = StockAdjustment;

export interface ApplyStockAdjustmentInput {
  readonly inventory: InventoryState;
  readonly actualStock: number;
  readonly costMode: AdjustmentCostMode | null;
  readonly customUnitCost?: Money | null;
}

export interface ApplyStockAdjustmentResult {
  readonly inventory: InventoryState;
  readonly difference: number;
  readonly costMode: AdjustmentCostMode | null;
  readonly unitCost: Money | null;
}

const ADJUSTMENT_REASONS: ReadonlySet<AdjustmentReason> = new Set([
  'COUNT_CORRECTION',
  'DAMAGED',
  'LOST',
  'INTERNAL_USE',
  'OTHER',
]);

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

function validateReason(reason: AdjustmentReason, difference: number): void {
  if (!ADJUSTMENT_REASONS.has(reason)) {
    throw new RangeError('Adjustment reason is invalid.');
  }

  if (difference > 0 && reason !== 'COUNT_CORRECTION' && reason !== 'OTHER') {
    throw new RangeError(
      'Positive adjustment reason must be COUNT_CORRECTION or OTHER.',
    );
  }
}

function validateCostMode(
  costMode: AdjustmentCostMode | null,
): AdjustmentCostMode | null {
  if (
    costMode !== null &&
    costMode !== 'USE_CURRENT_COST' &&
    costMode !== 'CUSTOM_COST'
  ) {
    throw new RangeError('Adjustment cost mode is invalid.');
  }

  return costMode;
}

function validateUnitCost(unitCost: Money | null, label: string): void {
  if (unitCost !== null && !(unitCost instanceof Money)) {
    throw new TypeError(`${label} must be Money or null.`);
  }

  if (unitCost !== null && unitCost.compare(Money.zero()) < 0) {
    throw new RangeError(`${label} must not be negative.`);
  }
}

function deriveDifference(stockBefore: number, actualStock: number): number {
  const difference = actualStock - stockBefore;

  if (!Number.isSafeInteger(difference)) {
    throw new RangeError('Stock adjustment difference must be a safe integer.');
  }

  if (difference === 0) {
    throw new RangeError('Stock adjustment difference must be non-zero.');
  }

  return difference;
}

function validateStockSnapshots(
  stockBefore: number,
  actualStock: number,
  difference: number,
): void {
  const normalizedStockBefore = requireSafeInteger(stockBefore, 'Stock before');
  const normalizedActualStock = requireSafeInteger(actualStock, 'Actual stock');

  if (normalizedActualStock < 0) {
    throw new RangeError('Actual stock must be non-negative.');
  }

  const expectedDifference = deriveDifference(
    normalizedStockBefore,
    normalizedActualStock,
  );
  const normalizedDifference = requireSafeInteger(
    difference,
    'Stock adjustment difference',
  );

  if (normalizedDifference !== expectedDifference) {
    throw new RangeError(
      'Stock adjustment difference must equal actual stock minus stock before.',
    );
  }
}

function validateEntityCost(
  difference: number,
  costMode: AdjustmentCostMode | null,
  unitCost: Money | null,
): void {
  const normalizedCostMode = validateCostMode(costMode);
  validateUnitCost(unitCost, 'Adjustment unit cost');

  if (difference > 0) {
    if (normalizedCostMode === null || unitCost === null) {
      throw new RangeError(
        'Positive adjustment cost mode and unit cost are required.',
      );
    }

    return;
  }

  if (normalizedCostMode !== null) {
    throw new RangeError('Negative adjustment cost mode must be null.');
  }

  if (unitCost === null) {
    throw new RangeError('Negative adjustment unit cost is required.');
  }
}

export function applyStockAdjustment({
  inventory,
  actualStock,
  costMode,
  customUnitCost = null,
}: ApplyStockAdjustmentInput): ApplyStockAdjustmentResult {
  const currentInventory = createInventoryState(inventory);
  const normalizedActualStock = requireSafeInteger(actualStock, 'Actual stock');

  if (normalizedActualStock < 0) {
    throw new RangeError('Actual stock must be non-negative.');
  }

  const difference = deriveDifference(
    currentInventory.stock,
    normalizedActualStock,
  );
  const normalizedCostMode = validateCostMode(costMode);

  if (difference > 0) {
    if (normalizedCostMode === null) {
      throw new RangeError(
        'Adjustment cost mode is required for a positive adjustment.',
      );
    }

    let resolvedUnitCost: Money;

    if (normalizedCostMode === 'USE_CURRENT_COST') {
      if (customUnitCost !== null) {
        throw new RangeError('USE_CURRENT_COST does not accept a custom cost.');
      }

      if (currentInventory.unitCost === null) {
        throw new RangeError(
          'Current cost is required when using USE_CURRENT_COST.',
        );
      }

      resolvedUnitCost = currentInventory.unitCost;
    } else {
      if (customUnitCost === null) {
        throw new RangeError('Custom cost is required when using CUSTOM_COST.');
      }

      validateUnitCost(customUnitCost, 'Custom cost');
      resolvedUnitCost = customUnitCost;
    }

    const resultingInventory = applyPurchase({
      inventory: currentInventory,
      quantity: difference,
      unitCost: resolvedUnitCost,
    });

    return Object.freeze({
      inventory: resultingInventory,
      difference,
      costMode: normalizedCostMode,
      unitCost: resolvedUnitCost,
    });
  }

  if (normalizedCostMode !== null) {
    throw new RangeError('Negative adjustment cost mode must be null.');
  }

  if (customUnitCost !== null) {
    throw new RangeError('Negative adjustment does not accept a custom cost.');
  }

  const currentUnitCost = currentInventory.unitCost;

  if (currentUnitCost === null) {
    throw new RangeError(
      'Current unit cost is required for a negative adjustment.',
    );
  }

  return Object.freeze({
    inventory: createInventoryState({
      stock: normalizedActualStock,
      unitCost: currentUnitCost,
    }),
    difference,
    costMode: null,
    unitCost: currentUnitCost,
  });
}

export function createStockAdjustment({
  id,
  inventoryId,
  productId,
  stockBefore,
  actualStock,
  difference,
  reason,
  costMode,
  unitCost,
  effectiveAt,
  createdAt,
  updatedAt,
}: CreateStockAdjustmentInput): StockAdjustment {
  validateStockSnapshots(stockBefore, actualStock, difference);
  validateReason(reason, difference);
  validateEntityCost(difference, costMode, unitCost);

  const normalizedCreatedAt = createTimestampMs(createdAt, 'Created at');
  const normalizedUpdatedAt = createTimestampMs(updatedAt, 'Updated at');

  if (normalizedUpdatedAt < normalizedCreatedAt) {
    throw new RangeError('Updated at must not be before created at.');
  }

  return Object.freeze({
    id: normalizeRequiredIdentifier(id, 'Stock adjustment ID'),
    inventoryId: normalizeRequiredIdentifier(inventoryId, 'Inventory ID'),
    productId: normalizeRequiredIdentifier(productId, 'Product ID'),
    stockBefore,
    actualStock,
    difference,
    reason,
    costMode,
    unitCost,
    effectiveAt: createTimestampMs(effectiveAt, 'Effective at'),
    createdAt: normalizedCreatedAt,
    updatedAt: normalizedUpdatedAt,
  });
}
