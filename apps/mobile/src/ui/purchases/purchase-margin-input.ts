import {
  getInitialPurchaseMargin,
  recommendPurchasePrice,
  type RegisterPurchaseResult,
} from '@stock-app/application';
import { Percentage } from '@stock-app/domain';

import { normalizeDecimalInput } from '../decimal-input';
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
  const digits = String(initial.scaledUnits).padStart(7, '0');
  const fraction = digits.slice(-6).replace(/0+$/, '');
  return `${digits.slice(0, -6)}${fraction ? `.${fraction}` : ''}`;
}

export function createPurchaseMarginPresentation(
  result: RegisterPurchaseResult,
  text: string,
  currency: string,
) {
  const isEligible = getInitialPurchaseMargin(result.priceAnalysis) !== null;
  const margin = parseDesiredMargin(text);
  const recommendation = recommendPurchasePrice(result.priceAnalysis, margin);
  return {
    isEligible,
    recommendation,
    errorMessage: !isEligible
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
