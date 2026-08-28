import type {
  RegisterPurchaseResult,
  UpdateProductInput,
} from '@stock-app/application';
import type { Product } from '@stock-app/domain';

import { formatPercentageForDisplay } from '../products/product-details-presentation';
import { formatMoneyForDisplay } from '../products/product-form-values';

export interface PurchasePricePresentation {
  readonly costChanged: boolean;
  readonly previousCostLabel: string;
  readonly currentCostLabel: string;
  readonly regularSalePriceLabel: string;
  readonly previousMarginLabel: string;
  readonly currentMarginLabel: string;
  readonly suggestedSalePriceLabel: string | null;
  readonly hasPriceDecision: boolean;
}

export function createPurchasePricePresentation(
  { priceAnalysis }: RegisterPurchaseResult,
  currency: string,
): PurchasePricePresentation {
  const {
    previousUnitCost,
    currentUnitCost,
    regularSalePrice,
    previousMargin,
    currentMargin,
    suggestedSalePrice,
    costChanged,
  } = priceAnalysis;

  return Object.freeze({
    costChanged,
    previousCostLabel:
      previousUnitCost === null
        ? 'No disponible'
        : formatMoneyForDisplay(previousUnitCost, currency),
    currentCostLabel: formatMoneyForDisplay(currentUnitCost, currency),
    regularSalePriceLabel: formatMoneyForDisplay(regularSalePrice, currency),
    previousMarginLabel:
      previousMargin === null
        ? 'No disponible'
        : formatPercentageForDisplay(previousMargin),
    currentMarginLabel:
      currentMargin === null
        ? 'No disponible'
        : formatPercentageForDisplay(currentMargin),
    suggestedSalePriceLabel:
      suggestedSalePrice === null
        ? null
        : formatMoneyForDisplay(suggestedSalePrice, currency),
    hasPriceDecision: suggestedSalePrice !== null,
  });
}

export function createSuggestedPriceUpdateInput({
  product,
  priceAnalysis,
}: RegisterPurchaseResult): UpdateProductInput | null {
  if (priceAnalysis.suggestedSalePrice === null) return null;

  return Object.freeze({
    inventoryId: product.inventoryId,
    productId: product.id,
    name: product.name,
    variant: product.variant,
    barcode: product.barcode,
    regularSalePrice: priceAnalysis.suggestedSalePrice,
    minimumStock: product.minimumStock,
  });
}

interface SuggestedPriceUpdater {
  execute(input: UpdateProductInput): Promise<Product>;
}

export async function applySuggestedPrice(
  result: RegisterPurchaseResult,
  updater: SuggestedPriceUpdater,
): Promise<Product> {
  const input = createSuggestedPriceUpdateInput(result);

  if (input === null) {
    throw new Error('No suggested sale price is available.');
  }

  return updater.execute(input);
}
