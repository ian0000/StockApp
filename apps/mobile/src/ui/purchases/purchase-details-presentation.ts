import type {
  GetPurchaseDetailsInput,
  HistoryEntry,
  PurchaseDetails,
} from '@stock-app/application';

import { formatMoneyForDisplay } from '../products/product-form-values';

export type PurchaseDetailsState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly details: PurchaseDetails | null }
  | { readonly status: 'error' };

export type PurchaseDetailsContentKind =
  'loading' | 'loaded' | 'not-found' | 'error';

export interface PurchaseDetailsPresentation {
  readonly dateLabel: string;
  readonly statusLabel: 'Confirmada' | 'Anulada';
  readonly isVoided: boolean;
  readonly productName: string;
  readonly productVariant: string | null;
  readonly quantityLabel: string;
  readonly unitCostLabel: string;
  readonly totalAmountLabel: string;
  readonly stockTransitionLabel: string;
  readonly averageCostBeforeLabel: string;
  readonly averageCostAfterLabel: string;
  readonly notes: string | null;
}

const PURCHASE_DATE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function normalizePurchaseIdParam(
  value: string | string[] | undefined,
): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

export function createPurchaseDetailsRoute(purchaseId: string) {
  return Object.freeze({
    pathname: '/purchase/[id]' as const,
    params: Object.freeze({ id: purchaseId }),
  });
}

export function getHistoryPurchaseRoute(entry: HistoryEntry) {
  return entry.type === 'PURCHASE'
    ? createPurchaseDetailsRoute(entry.id)
    : null;
}

export function createPurchaseDetailsRequest(
  inventoryId: string,
  purchaseId: string,
): GetPurchaseDetailsInput {
  return Object.freeze({ inventoryId, purchaseId });
}

export function getPurchaseDetailsContentKind(
  state: PurchaseDetailsState,
): PurchaseDetailsContentKind {
  if (state.status !== 'ready') return state.status;
  return state.details === null ? 'not-found' : 'loaded';
}

function unitsLabel(quantity: number): string {
  return `${quantity} ${quantity === 1 ? 'unidad' : 'unidades'}`;
}

export function createPurchaseDetailsPresentation(
  details: PurchaseDetails,
  currency: string,
): PurchaseDetailsPresentation {
  return Object.freeze({
    dateLabel: PURCHASE_DATE_TIME_FORMATTER.format(
      new Date(details.effectiveAt),
    ),
    statusLabel: details.status === 'VOIDED' ? 'Anulada' : 'Confirmada',
    isVoided: details.status === 'VOIDED',
    productName: details.productName ?? 'Producto no disponible',
    productVariant: details.productVariant,
    quantityLabel: unitsLabel(details.quantity),
    unitCostLabel: formatMoneyForDisplay(details.unitCost, currency),
    totalAmountLabel: formatMoneyForDisplay(details.totalAmount, currency),
    stockTransitionLabel: `${details.stockBefore} → ${unitsLabel(
      details.stockAfter,
    )}`,
    averageCostBeforeLabel:
      details.averageCostBefore === null
        ? 'No disponible'
        : formatMoneyForDisplay(details.averageCostBefore, currency),
    averageCostAfterLabel: formatMoneyForDisplay(
      details.averageCostAfter,
      currency,
    ),
    notes: details.notes,
  });
}
