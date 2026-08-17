import { Money } from '../money/index';

export interface CalculateWeightedAverageCostInput {
  currentStock: number;
  currentAverageCost?: Money;
  purchasedQuantity: number;
  purchaseUnitCost: Money;
}

function requireSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer.`);
  }

  return value;
}

function requireNonNegative(cost: Money, label: string): void {
  if (cost.compare(Money.zero()) < 0) {
    throw new RangeError(`${label} must not be negative.`);
  }
}

export function calculateWeightedAverageCost({
  currentStock,
  currentAverageCost,
  purchasedQuantity,
  purchaseUnitCost,
}: CalculateWeightedAverageCostInput): Money {
  const safeCurrentStock = requireSafeInteger(currentStock, 'Current stock');
  const safePurchasedQuantity = requireSafeInteger(
    purchasedQuantity,
    'Purchased quantity',
  );

  if (safePurchasedQuantity <= 0) {
    throw new RangeError('Purchased quantity must be greater than zero.');
  }

  requireNonNegative(purchaseUnitCost, 'Purchase unit cost');

  if (safeCurrentStock <= 0) {
    return purchaseUnitCost;
  }

  if (currentAverageCost === undefined) {
    throw new RangeError(
      'Current average cost is required when current stock is positive.',
    );
  }

  requireNonNegative(currentAverageCost, 'Current average cost');

  const totalQuantity = requireSafeInteger(
    safeCurrentStock + safePurchasedQuantity,
    'Total quantity',
  );
  const currentInventoryValue =
    currentAverageCost.multiplyByInteger(safeCurrentStock);
  const purchasedInventoryValue = purchaseUnitCost.multiplyByInteger(
    safePurchasedQuantity,
  );
  const totalInventoryValue = currentInventoryValue.add(
    purchasedInventoryValue,
  );

  return totalInventoryValue.divideByInteger(totalQuantity);
}
