import { multiplyDivideAndRoundHalfAwayFromZero } from '../internal/integer-arithmetic';
import { Money } from '../money/index';
import { Percentage } from '../percentage/index';

const ONE_HUNDRED_PERCENT_SCALED = 100_000_000;

export interface SuggestSalePriceForMarginInput {
  unitCost: Money;
  targetMargin: Percentage;
}

export function suggestSalePriceForMargin({
  unitCost,
  targetMargin,
}: SuggestSalePriceForMarginInput): Money | null {
  if (unitCost.compare(Money.zero()) < 0) {
    throw new RangeError('Unit cost must not be negative.');
  }

  if (unitCost.equals(Money.zero())) {
    return null;
  }

  if (targetMargin.scaledUnits >= ONE_HUNDRED_PERCENT_SCALED) {
    return null;
  }

  const remainingPercentage =
    ONE_HUNDRED_PERCENT_SCALED - targetMargin.scaledUnits;

  return Money.fromScaledUnits(
    multiplyDivideAndRoundHalfAwayFromZero(
      unitCost.scaledUnits,
      ONE_HUNDRED_PERCENT_SCALED,
      remainingPercentage,
    ),
  );
}
