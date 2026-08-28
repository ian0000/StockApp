import {
  SaleNotFoundError,
  type GetSaleDetailsInput,
  type HistoryEntry,
  type SaleDetails,
  type VoidSaleResult,
} from '@stock-app/application';

import { formatMoneyForDisplay } from '../products/product-form-values';

export type SaleDetailsState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly details: SaleDetails | null }
  | { readonly status: 'error' };

export type SaleDetailsContentKind =
  'loading' | 'loaded' | 'not-found' | 'error';

export interface SaleDetailsItemPresentation {
  readonly id: string;
  readonly productName: string;
  readonly productVariant: string | null;
  readonly quantityAndPriceLabel: string;
  readonly subtotalLabel: string;
  readonly unitCostLabel: string;
  readonly estimatedProfitLabel: string;
}

export interface SaleDetailsPresentation {
  readonly dateLabel: string;
  readonly statusLabel: 'Confirmada' | 'Anulada';
  readonly isVoided: boolean;
  readonly totalUnitsLabel: string;
  readonly totalAmountLabel: string;
  readonly estimatedCostLabel: string;
  readonly estimatedProfitLabel: string;
  readonly notes: string | null;
  readonly items: readonly SaleDetailsItemPresentation[];
}

export type SaleVoidFeedbackPresentation =
  | {
      readonly kind: 'success' | 'information' | 'not-eligible';
      readonly title: string;
      readonly message: string;
      readonly shouldRefresh: boolean;
      readonly canRetry: false;
    }
  | {
      readonly kind: 'technical-error';
      readonly title: string;
      readonly message: string;
      readonly shouldRefresh: false;
      readonly canRetry: true;
    };

export type SaleVoidErrorPresentation =
  | SaleVoidFeedbackPresentation
  | {
      readonly kind: 'not-found';
      readonly shouldRefresh: true;
      readonly canRetry: false;
    };

export interface SaleVoidSubmissionGate {
  readonly tryStart: () => boolean;
  readonly finish: () => void;
}

const SALE_DATE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function normalizeSaleIdParam(
  value: string | string[] | undefined,
): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

export function createSaleDetailsRoute(saleId: string) {
  return Object.freeze({
    pathname: '/sale/[id]' as const,
    params: Object.freeze({ id: saleId }),
  });
}

export function getHistorySaleRoute(entry: HistoryEntry) {
  return entry.type === 'SALE' ? createSaleDetailsRoute(entry.id) : null;
}

export function createSaleDetailsRequest(
  inventoryId: string,
  saleId: string,
): GetSaleDetailsInput {
  return Object.freeze({ inventoryId, saleId });
}

export function getSaleDetailsContentKind(
  state: SaleDetailsState,
): SaleDetailsContentKind {
  if (state.status !== 'ready') return state.status;
  return state.details === null ? 'not-found' : 'loaded';
}

export function isSaleVoidActionVisible(
  status: SaleDetails['status'],
  persistence: 'sqlite' | 'web-preview',
): boolean {
  return status === 'CONFIRMED' && persistence === 'sqlite';
}

export function getSaleVoidResultPresentation(
  result: VoidSaleResult,
): SaleVoidFeedbackPresentation {
  if (result.kind === 'VOIDED') {
    return Object.freeze({
      kind: 'success' as const,
      title: 'Venta anulada',
      message:
        'El stock fue restaurado y la venta permanece en tu historial como anulada.',
      shouldRefresh: true,
      canRetry: false,
    });
  }

  if (result.kind === 'ALREADY_VOIDED') {
    return Object.freeze({
      kind: 'information' as const,
      title: 'Venta ya anulada',
      message: 'Esta venta ya estaba anulada.',
      shouldRefresh: true,
      canRetry: false,
    });
  }

  return Object.freeze({
    kind: 'not-eligible' as const,
    title: 'No se puede anular esta venta',
    message:
      'Hay operaciones posteriores de uno o más productos y ya no es posible restaurar el inventario de forma segura.',
    shouldRefresh: false,
    canRetry: false,
  });
}

export function getSaleVoidErrorPresentation(
  error: unknown,
): SaleVoidErrorPresentation {
  if (error instanceof SaleNotFoundError) {
    return Object.freeze({
      kind: 'not-found' as const,
      shouldRefresh: true,
      canRetry: false,
    });
  }

  return Object.freeze({
    kind: 'technical-error' as const,
    title: 'No pudimos anular la venta',
    message: 'Inténtalo nuevamente. Tus datos no fueron modificados.',
    shouldRefresh: false,
    canRetry: true,
  });
}

export function createSaleVoidSubmissionGate(): SaleVoidSubmissionGate {
  let isRunning = false;

  return Object.freeze({
    tryStart() {
      if (isRunning) return false;
      isRunning = true;
      return true;
    },
    finish() {
      isRunning = false;
    },
  });
}

function unitsLabel(quantity: number): string {
  return `${quantity} ${quantity === 1 ? 'unidad' : 'unidades'}`;
}

export function createSaleDetailsPresentation(
  details: SaleDetails,
  currency: string,
): SaleDetailsPresentation {
  return Object.freeze({
    dateLabel: SALE_DATE_TIME_FORMATTER.format(new Date(details.effectiveAt)),
    statusLabel: details.status === 'VOIDED' ? 'Anulada' : 'Confirmada',
    isVoided: details.status === 'VOIDED',
    totalUnitsLabel: unitsLabel(details.totalUnits),
    totalAmountLabel: formatMoneyForDisplay(details.totalAmount, currency),
    estimatedCostLabel:
      details.estimatedCost === null
        ? 'No disponible'
        : formatMoneyForDisplay(details.estimatedCost, currency),
    estimatedProfitLabel:
      details.estimatedProfit === null
        ? 'No disponible'
        : formatMoneyForDisplay(details.estimatedProfit, currency),
    notes: details.notes,
    items: Object.freeze(
      details.items.map((item) =>
        Object.freeze({
          id: item.id,
          productName: item.productName ?? 'Producto no disponible',
          productVariant: item.productVariant,
          quantityAndPriceLabel: `${item.quantity} × ${formatMoneyForDisplay(
            item.unitSalePrice,
            currency,
          )}`,
          subtotalLabel: formatMoneyForDisplay(item.subtotal, currency),
          unitCostLabel:
            item.unitCostSnapshot === null
              ? 'No disponible'
              : formatMoneyForDisplay(item.unitCostSnapshot, currency),
          estimatedProfitLabel:
            item.estimatedProfit === null
              ? 'No disponible'
              : formatMoneyForDisplay(item.estimatedProfit, currency),
        }),
      ),
    ),
  });
}
