import {
  getInitialPurchaseMargin,
  canEditPurchaseMargin,
  recommendPurchasePrice,
  type RegisterPurchaseResult,
} from '@stock-app/application';
import { Percentage } from '@stock-app/domain';

import {
  normalizeDecimalInput,
  formatScaledUnitsForInput,
} from '../decimal-input';
import { formatMoneyForDisplay } from '../products/product-form-values';

export function parseDesiredMargin(value: string): Percentage | null {
  const normalized = normalizeDecimalInput(value);
  if (normalized === null) return null;
  try {
    const margin = Percentage.fromDecimal(normalized);
    return margin.scaledUnits >= 0 && margin.scaledUnits < 100_000_000
      ? margin
      : null;
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) return null;
    throw error;
  }
}

export function createInitialPurchaseMarginText({
  priceAnalysis,
}: RegisterPurchaseResult): string {
  const initial = getInitialPurchaseMargin(priceAnalysis);
  if (initial === null) return '';
  return formatScaledUnitsForInput(initial.scaledUnits);
}

export function resolvePurchaseDesiredMargin(
  result: RegisterPurchaseResult,
  text: string,
  isDirty: boolean,
): Percentage | null {
  // The immutable purchase result is the original reference, never the rounded input text.
  return isDirty
    ? parseDesiredMargin(text)
    : getInitialPurchaseMargin(result.priceAnalysis);
}

export function createPurchaseMarginPresentation(
  result: RegisterPurchaseResult,
  text: string,
  currency: string,
  isDirty = true,
) {
  const isEligible = canEditPurchaseMargin(
    result.priceAnalysis.currentUnitCost,
  );
  const margin = resolvePurchaseDesiredMargin(result, text, isDirty);
  const recommendation = recommendPurchasePrice(result.priceAnalysis, margin);
  return {
    isEligible,
    recommendation,
    errorMessage:
      !isEligible || text.trim() === ''
        ? null
        : margin === null
          ? 'Ingresa un margen desde 0% y menor que 100%, con hasta 6 decimales.'
          : recommendation.status === 'UNAVAILABLE'
            ? 'No podemos calcular un precio para ese margen. Prueba un valor menor.'
            : null,
    suggestedSalePriceLabel:
      recommendation.status === 'PRICE_INCREASE_SUGGESTED'
        ? formatMoneyForDisplay(
            recommendation.actionableSuggestedPrice,
            currency,
          )
        : null,
  };
}
