import {
  PurchaseNotFoundError,
  type GetPurchaseDetailsInput,
  type HistoryEntry,
  type PurchaseDetails,
  type VoidPurchaseResult,
} from '@stock-app/application';

import {
  createVoidSubmissionGate,
  type VoidSubmissionGate,
} from '../operations/void-submission-gate';
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

export type PurchaseVoidFeedbackPresentation =
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

export type PurchaseVoidErrorPresentation =
  | PurchaseVoidFeedbackPresentation
  | {
      readonly kind: 'not-found';
      readonly shouldRefresh: true;
      readonly canRetry: false;
    };

export type PurchaseVoidSubmissionGate = VoidSubmissionGate;

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

export function isPurchaseVoidActionVisible(
  status: PurchaseDetails['status'],
  persistence: 'sqlite' | 'web-preview',
): boolean {
  return status === 'CONFIRMED' && persistence === 'sqlite';
}

export function getPurchaseVoidResultPresentation(
  result: VoidPurchaseResult,
): PurchaseVoidFeedbackPresentation {
  if (result.kind === 'VOIDED') {
    return Object.freeze({
      kind: 'success' as const,
      title: 'Compra anulada',
      message:
        'El stock y el costo fueron restaurados. La compra permanece en tu historial como anulada.',
      shouldRefresh: true,
      canRetry: false,
    });
  }

  if (result.kind === 'ALREADY_VOIDED') {
    return Object.freeze({
      kind: 'information' as const,
      title: 'Compra ya anulada',
      message: 'Esta compra ya estaba anulada.',
      shouldRefresh: true,
      canRetry: false,
    });
  }

  return Object.freeze({
    kind: 'not-eligible' as const,
    title: 'No se puede anular esta compra',
    message:
      'Hay operaciones posteriores de este producto y ya no es posible volver de forma segura al estado anterior.',
    shouldRefresh: false,
    canRetry: false,
  });
}

export function getPurchaseVoidErrorPresentation(
  error: unknown,
): PurchaseVoidErrorPresentation {
  if (error instanceof PurchaseNotFoundError) {
    return Object.freeze({
      kind: 'not-found' as const,
      shouldRefresh: true,
      canRetry: false,
    });
  }

  return Object.freeze({
    kind: 'technical-error' as const,
    title: 'No pudimos anular la compra',
    message: 'Inténtalo nuevamente. Tus datos no fueron modificados.',
    shouldRefresh: false,
    canRetry: true,
  });
}

export function createPurchaseVoidSubmissionGate(): PurchaseVoidSubmissionGate {
  return createVoidSubmissionGate();
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
