import { multiplyDivideAndRoundHalfAwayFromZero } from '../internal/integer-arithmetic';
import { Money } from '../money/index';
import { Percentage } from '../percentage/index';

const PERCENTAGE_RATIO_SCALE = 100_000_000;

export interface ProfitabilityInput {
  salePrice: Money;
  estimatedUnitCost: Money;
}

function requireNonNegative(value: Money, label: string): void {
  if (value.compare(Money.zero()) < 0) {
    throw new RangeError(`${label} must not be negative.`);
  }
}

function validateInput({
  salePrice,
  estimatedUnitCost,
}: ProfitabilityInput): void {
  requireNonNegative(salePrice, 'Sale price');
  requireNonNegative(estimatedUnitCost, 'Estimated unit cost');
}

function calculatePercentage(numerator: Money, denominator: Money): Percentage {
  return Percentage.fromScaledUnits(
    multiplyDivideAndRoundHalfAwayFromZero(
      numerator.scaledUnits,
      PERCENTAGE_RATIO_SCALE,
      denominator.scaledUnits,
    ),
  );
}

export function calculateEstimatedProfit(input: ProfitabilityInput): Money {
  validateInput(input);

  return input.salePrice.subtract(input.estimatedUnitCost);
}

export function calculateMargin(input: ProfitabilityInput): Percentage | null {
  validateInput(input);

  if (input.salePrice.equals(Money.zero())) {
    return null;
  }

  const profit = input.salePrice.subtract(input.estimatedUnitCost);

  return calculatePercentage(profit, input.salePrice);
}

export function calculateMarkup(input: ProfitabilityInput): Percentage | null {
  validateInput(input);

  if (input.estimatedUnitCost.equals(Money.zero())) {
    return null;
  }

  const profit = input.salePrice.subtract(input.estimatedUnitCost);

  return calculatePercentage(profit, input.estimatedUnitCost);
}
