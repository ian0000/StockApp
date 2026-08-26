import type { HistoryEntry, ListHistoryInput } from '@stock-app/application';

import {
  adjustmentReasonLabel,
  formatSignedDifference,
} from '../adjustments/stock-adjustment-form';
import { formatMoneyForDisplay } from '../products/product-form-values';

export const HOME_RECENT_OPERATIONS_LIMIT = 5;
export const HISTORY_TAB_ROUTE = '/history' as const;

export type RecentOperationsState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly entries: readonly HistoryEntry[] }
  | { readonly status: 'error' };

export type RecentOperationsContentKind =
  'loading' | 'empty' | 'error' | 'ready';

export type HistoryRowVariant = 'history' | 'recent';

export interface HistoryRowPresentation {
  readonly typeLabel: 'VENTA' | 'COMPRA' | 'AJUSTE';
  readonly primary: string;
  readonly secondary: string | null;
  readonly detail: string;
  readonly timestamp: number;
  readonly isVoided: boolean;
}

const HISTORY_DATE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function createRecentOperationsRequest(
  inventoryId: string,
): ListHistoryInput {
  return Object.freeze({
    inventoryId,
    limit: HOME_RECENT_OPERATIONS_LIMIT,
  });
}

export function getRecentOperationsContentKind(
  state: RecentOperationsState,
): RecentOperationsContentKind {
  if (state.status !== 'ready') return state.status;
  return state.entries.length === 0 ? 'empty' : 'ready';
}

function unitsLabel(quantity: number): string {
  return `${quantity} ${quantity === 1 ? 'unidad' : 'unidades'}`;
}

export function createHistoryRowPresentation(
  entry: HistoryEntry,
  currency: string,
  variant: HistoryRowVariant,
): HistoryRowPresentation {
  switch (entry.type) {
    case 'SALE':
      return Object.freeze({
        typeLabel: 'VENTA',
        primary: formatMoneyForDisplay(entry.totalAmount, currency),
        secondary: null,
        detail: unitsLabel(entry.units),
        timestamp: entry.effectiveAt,
        isVoided: entry.status === 'VOIDED',
      });
    case 'PURCHASE':
      return Object.freeze({
        typeLabel: 'COMPRA',
        primary: entry.productName,
        secondary: entry.productVariant,
        detail:
          variant === 'recent'
            ? `+${unitsLabel(entry.quantity)} · ${formatMoneyForDisplay(
                entry.totalAmount,
                currency,
              )}`
            : `+${entry.quantity} · ${formatMoneyForDisplay(
                entry.unitCost,
                currency,
              )} c/u`,
        timestamp: entry.effectiveAt,
        isVoided: entry.status === 'VOIDED',
      });
    case 'ADJUSTMENT':
      return Object.freeze({
        typeLabel: 'AJUSTE',
        primary: entry.productName,
        secondary: entry.productVariant,
        detail: `${formatSignedDifference(entry.difference)}${
          variant === 'recent' ? ' unidades' : ''
        } · ${adjustmentReasonLabel(entry.reason)}`,
        timestamp: entry.effectiveAt,
        isVoided: false,
      });
  }
}

export function formatHistoryTimestamp(timestamp: number): string {
  return HISTORY_DATE_TIME_FORMATTER.format(new Date(timestamp));
}
