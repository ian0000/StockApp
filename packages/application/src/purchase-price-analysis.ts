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

export type PurchasePriceRecommendation =
  | { readonly status: 'UNAVAILABLE' }
  | {
      readonly status:
        'PRICE_INCREASE_SUGGESTED' | 'CURRENT_PRICE_ALREADY_SUFFICIENT';
      readonly calculatedPrice: Money;
      readonly actionableSuggestedPrice: Money;
    };

function isValidDesiredMargin(margin: Percentage | null): margin is Percentage {
  return (
    margin !== null &&
    margin.scaledUnits >= 0 &&
    margin.scaledUnits < 100_000_000
  );
}

export function getInitialPurchaseMargin(
  analysis: PurchasePriceAnalysis,
): Percentage | null {
  const margin = analysis.previousMargin;
  return analysis.costChanged &&
    isValidDesiredMargin(margin) &&
    calculateAvailableSuggestion(analysis.currentUnitCost, margin) !== null
    ? margin
    : null;
}

export function recommendPurchasePrice(
  analysis: PurchasePriceAnalysis,
  desiredMargin: Percentage | null,
): PurchasePriceRecommendation {
  if (
    getInitialPurchaseMargin(analysis) === null ||
    !isValidDesiredMargin(desiredMargin)
  ) {
    return Object.freeze({ status: 'UNAVAILABLE' });
  }
  const calculatedPrice = calculateAvailableSuggestion(
    analysis.currentUnitCost,
    desiredMargin,
  );
  if (calculatedPrice === null) return Object.freeze({ status: 'UNAVAILABLE' });

  // A mathematical price is not a recommendation to reduce the current selling price.
  const increase = calculatedPrice.compare(analysis.regularSalePrice) > 0;
  return Object.freeze({
    status: increase
      ? 'PRICE_INCREASE_SUGGESTED'
      : 'CURRENT_PRICE_ALREADY_SUFFICIENT',
    calculatedPrice,
    actionableSuggestedPrice: increase
      ? calculatedPrice
      : analysis.regularSalePrice,
  });
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
    costChanged && isValidDesiredMargin(previousMargin)
      ? calculateAvailableSuggestion(currentUnitCost, previousMargin)
      : null;
  const suggestedSalePrice =
    candidateSuggestion !== null &&
    candidateSuggestion.compare(regularSalePrice) > 0
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
