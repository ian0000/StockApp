import type { Money } from '@stock-app/domain';

import { formatMoneyForDisplay } from '../products/product-form-values';

export function formatEstimatedProfitForDisplay(
  estimatedProfit: Money | null,
  currency: string,
): string {
  return estimatedProfit === null
    ? '—'
    : formatMoneyForDisplay(estimatedProfit, currency);
}
