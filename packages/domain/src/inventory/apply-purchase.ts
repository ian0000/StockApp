import { Money } from '../money/index';
import { calculateWeightedAverageCost } from './weighted-average-cost';

export interface InventoryState {
  readonly stock: number;
  readonly unitCost: Money | null;
}

export interface ApplyPurchaseInput {
  readonly inventory: InventoryState;
  readonly quantity: number;
  readonly unitCost: Money;
}

function requireSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer.`);
  }

  return value;
}

function validateInventoryState({ stock, unitCost }: InventoryState): void {
  requireSafeInteger(stock, 'Inventory stock');

  if (unitCost !== null && unitCost.compare(Money.zero()) < 0) {
    throw new RangeError('Inventory unit cost must not be negative.');
  }

  if (stock > 0 && unitCost === null) {
    throw new RangeError(
      'Inventory unit cost is required when stock is positive.',
    );
  }
}

export function createInventoryState(state: InventoryState): InventoryState {
  validateInventoryState(state);

  return Object.freeze({
    stock: state.stock,
    unitCost: state.unitCost,
  });
}

export function applyPurchase({
  inventory,
  quantity,
  unitCost,
}: ApplyPurchaseInput): InventoryState {
  validateInventoryState(inventory);

  const nextUnitCost = calculateWeightedAverageCost({
    currentStock: inventory.stock,
    purchasedQuantity: quantity,
    purchaseUnitCost: unitCost,
    ...(inventory.unitCost === null
      ? {}
      : { currentAverageCost: inventory.unitCost }),
  });
  const nextStock = requireSafeInteger(
    inventory.stock + quantity,
    'Resulting stock',
  );

  return createInventoryState({
    stock: nextStock,
    unitCost: nextUnitCost,
  });
}
