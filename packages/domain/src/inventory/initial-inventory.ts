import { Money } from '../money/index';
import { createInventoryState, type InventoryState } from './apply-purchase';
import {
  createInitialStockMovement,
  type InventoryMovement,
} from './inventory-movement';

export interface CreateInitialInventoryInput {
  readonly initialStock: number;
  readonly initialUnitCost: Money | null;
}

export interface InitialInventoryResult {
  readonly inventory: InventoryState;
  readonly movement: InventoryMovement | null;
}

export function createInitialInventory({
  initialStock,
  initialUnitCost,
}: CreateInitialInventoryInput): InitialInventoryResult {
  if (!Number.isSafeInteger(initialStock)) {
    throw new RangeError('Initial stock must be a safe integer.');
  }

  if (initialStock < 0) {
    throw new RangeError('Initial stock must not be negative.');
  }

  if (initialStock === 0) {
    if (initialUnitCost !== null) {
      throw new RangeError(
        'Initial unit cost must be null when initial stock is zero.',
      );
    }

    return Object.freeze({
      inventory: createInventoryState({ stock: 0, unitCost: null }),
      movement: null,
    });
  }

  if (initialUnitCost === null) {
    throw new RangeError(
      'Initial unit cost is required when initial stock is positive.',
    );
  }

  return Object.freeze({
    inventory: createInventoryState({
      stock: initialStock,
      unitCost: initialUnitCost,
    }),
    movement: createInitialStockMovement({
      quantity: initialStock,
      unitCost: initialUnitCost,
    }),
  });
}
