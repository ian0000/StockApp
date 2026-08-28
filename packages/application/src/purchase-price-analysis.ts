import {
  calculateMargin,
  Money,
  suggestSalePriceForMargin,
  type InventoryState,
  type Percentage,
} from '@stock-app/domain';

export interface PurchasePriceAnalysisInput {
  readonly beforeInventoryState: InventoryState;
  readonly afterInventoryState: InventoryState;
  readonly regularSalePrice: Money;
}

export interface PurchasePriceAnalysis {
  readonly previousUnitCost: Money | null;
  readonly currentUnitCost: Money;
  readonly regularSalePrice: Money;
  readonly previousMargin: Percentage | null;
  readonly currentMargin: Percentage | null;
  readonly suggestedSalePrice: Money | null;
  readonly costChanged: boolean;
}

function calculateAvailableMargin(
  salePrice: Money,
  unitCost: Money,
): Percentage | null {
  try {
    return calculateMargin({ salePrice, estimatedUnitCost: unitCost });
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

function calculateAvailableSuggestion(
  unitCost: Money,
  targetMargin: Percentage,
): Money | null {
  try {
    return suggestSalePriceForMargin({ unitCost, targetMargin });
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

export function createPurchasePriceAnalysis({
  beforeInventoryState,
  afterInventoryState,
  regularSalePrice,
}: PurchasePriceAnalysisInput): PurchasePriceAnalysis {
  const previousUnitCost = beforeInventoryState.unitCost;
  const currentUnitCost = afterInventoryState.unitCost;

  if (currentUnitCost === null) {
    throw new Error('Purchase resulting cost unexpectedly missing.');
  }

  const costChanged =
    previousUnitCost === null || !previousUnitCost.equals(currentUnitCost);
  const previousMargin =
    previousUnitCost === null
      ? null
      : calculateAvailableMargin(regularSalePrice, previousUnitCost);
  const currentMargin = calculateAvailableMargin(
    regularSalePrice,
    currentUnitCost,
  );
  const candidateSuggestion =
    costChanged && previousMargin !== null
      ? calculateAvailableSuggestion(currentUnitCost, previousMargin)
      : null;
  const suggestedSalePrice =
    candidateSuggestion !== null &&
    !candidateSuggestion.equals(regularSalePrice)
      ? candidateSuggestion
      : null;

  return Object.freeze({
    previousUnitCost,
    currentUnitCost,
    regularSalePrice,
    previousMargin,
    currentMargin,
    suggestedSalePrice,
    costChanged,
  });
}
