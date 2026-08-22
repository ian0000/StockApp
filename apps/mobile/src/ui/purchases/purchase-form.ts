import { Money } from '@stock-app/domain';

import {
  formatMoneyForDisplay,
  normalizeMoneyInput,
} from '../products/product-form-values';

export interface PurchaseFormValues {
  readonly quantity: string;
  readonly unitCost: string;
}

export type ParsePurchaseFormResult =
  | {
      readonly ok: true;
      readonly quantity: number;
      readonly unitCost: Money;
      readonly total: Money;
    }
  | {
      readonly ok: false;
      readonly quantityError: string | null;
      readonly unitCostError: string | null;
    };

function parsePositiveSafeInteger(value: string): number | null {
  const normalized = value.trim();

  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseNonNegativeMoney(value: string): Money | null {
  const normalized = normalizeMoneyInput(value);

  if (normalized === null) {
    return null;
  }

  try {
    const money = Money.fromDecimal(normalized);

    return money.compare(Money.zero()) >= 0 ? money : null;
  } catch {
    return null;
  }
}

export function parsePurchaseFormValues({
  quantity: quantityText,
  unitCost: unitCostText,
}: PurchaseFormValues): ParsePurchaseFormResult {
  const quantity = parsePositiveSafeInteger(quantityText);
  const unitCost = parseNonNegativeMoney(unitCostText);

  if (quantity === null || unitCost === null) {
    return Object.freeze({
      quantityError:
        quantity === null ? 'Usa una cantidad entera mayor que cero.' : null,
      unitCostError: unitCost === null ? 'Usa un costo unitario válido.' : null,
      ok: false as const,
    });
  }

  try {
    return Object.freeze({
      ok: true as const,
      quantity,
      unitCost,
      total: unitCost.multiplyByInteger(quantity),
    });
  } catch {
    return Object.freeze({
      quantityError: null,
      unitCostError: 'La cantidad y el costo producen un total no admitido.',
      ok: false as const,
    });
  }
}

export function formatAverageCostTransition(
  before: Money | null,
  after: Money,
  currency: string,
): string {
  const beforeText =
    before === null ? '—' : formatMoneyForDisplay(before, currency);

  return `${beforeText} → ${formatMoneyForDisplay(after, currency)}`;
}

export function formatStockTransition(before: number, after: number): string {
  if (!Number.isSafeInteger(before) || !Number.isSafeInteger(after)) {
    throw new RangeError('Stock transition must use safe integers.');
  }

  return `${before} → ${after}`;
}
