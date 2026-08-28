import type {
  GetProductDetailsInput,
  ProductDetails,
} from '@stock-app/application';
import type { Percentage } from '@stock-app/domain';

import { formatMoneyForDisplay } from './product-form-values';

const PERCENTAGE_UNITS_PER_HUNDREDTH = 10_000;

export type ProductDetailsState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly details: ProductDetails | null }
  | { readonly status: 'error' };

export type ProductDetailsContentKind =
  'loading' | 'loaded' | 'not-found' | 'error';

export type ProductDetailsStockStatus = 'positive' | 'zero' | 'negative';

export interface ProductDetailsPresentation {
  readonly name: string;
  readonly variant: string | null;
  readonly stockLabel: string;
  readonly stockStatus: ProductDetailsStockStatus;
  readonly lowStockLabel: 'Stock bajo' | null;
  readonly minimumStockLabel: string;
  readonly costLabel: string;
  readonly priceLabel: string;
  readonly estimatedUnitProfitLabel: string;
  readonly marginLabel: string;
  readonly markupLabel: string;
}

export function createProductDetailsRoute(productId: string) {
  return Object.freeze({
    pathname: '/product/[id]' as const,
    params: Object.freeze({ id: productId }),
  });
}

export function normalizeProductIdParam(
  value: string | readonly string[] | undefined,
): string | null {
  if (typeof value !== 'string') return null;

  const productId = value.trim();
  return productId.length === 0 ? null : productId;
}

export function createProductDetailsRequest(
  inventoryId: string,
  productId: string,
): GetProductDetailsInput {
  return Object.freeze({ inventoryId, productId });
}

export function getProductDetailsContentKind(
  state: ProductDetailsState,
): ProductDetailsContentKind {
  if (state.status !== 'ready') return state.status;
  return state.details === null ? 'not-found' : 'loaded';
}

function getStockStatus(stock: number): ProductDetailsStockStatus {
  if (stock < 0) return 'negative';
  return stock === 0 ? 'zero' : 'positive';
}

export function formatPercentageForDisplay(percentage: Percentage): string {
  const isNegative = percentage.scaledUnits < 0;
  const magnitude = Math.abs(percentage.scaledUnits);
  let hundredths = Math.floor(magnitude / PERCENTAGE_UNITS_PER_HUNDREDTH);

  if (
    magnitude % PERCENTAGE_UNITS_PER_HUNDREDTH >=
    PERCENTAGE_UNITS_PER_HUNDREDTH / 2
  ) {
    hundredths += 1;
  }

  const whole = Math.floor(hundredths / 100);
  const fraction = String(hundredths % 100).padStart(2, '0');
  const sign = isNegative ? '-' : '';

  return `${sign}${whole}.${fraction}%`;
}

export function createProductDetailsPresentation(
  details: ProductDetails,
  currency: string,
): ProductDetailsPresentation {
  return Object.freeze({
    name: details.name,
    variant: details.variant,
    stockLabel: `${details.stock} unidades`,
    stockStatus: getStockStatus(details.stock),
    lowStockLabel: details.isLowStock ? 'Stock bajo' : null,
    minimumStockLabel:
      details.minimumStock === null
        ? 'Mínimo no configurado'
        : `Mínimo configurado: ${details.minimumStock}`,
    costLabel:
      details.unitCost === null
        ? 'Costo desconocido'
        : formatMoneyForDisplay(details.unitCost, currency),
    priceLabel: formatMoneyForDisplay(details.regularSalePrice, currency),
    estimatedUnitProfitLabel:
      details.estimatedUnitProfit === null
        ? 'No disponible'
        : formatMoneyForDisplay(details.estimatedUnitProfit, currency),
    marginLabel:
      details.margin === null
        ? 'No disponible'
        : formatPercentageForDisplay(details.margin),
    markupLabel:
      details.markup === null
        ? 'No disponible'
        : formatPercentageForDisplay(details.markup),
  });
}
