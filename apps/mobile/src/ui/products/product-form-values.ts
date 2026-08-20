import type { CreateProductInput } from '@stock-app/application';
import { Money } from '@stock-app/domain';

export interface ProductFormValues {
  readonly name: string;
  readonly variant: string;
  readonly barcode: string;
  readonly regularSalePrice: string;
  readonly initialStock: string;
  readonly initialUnitCost: string;
  readonly minimumStock: string;
}

type ParsedProductFormInput = Omit<CreateProductInput, 'inventoryId'>;

export type ParseProductFormResult =
  | { readonly ok: true; readonly input: ParsedProductFormInput }
  | { readonly ok: false; readonly message: string };

function parseNonNegativeSafeInteger(value: string): number | null {
  const normalized = value.trim();

  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);

  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function normalizeMoneyInput(value: string): string | null {
  const normalized = value.trim();

  if (!/^(?:\d+|\d*[.,]\d+)$/.test(normalized)) {
    return null;
  }

  const withLeadingZero = /^[.,]/.test(normalized)
    ? `0${normalized}`
    : normalized;

  return withLeadingZero.replace(',', '.');
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

function optionalText(value: string): string | null {
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

export function parseProductFormValues(
  values: ProductFormValues,
): ParseProductFormResult {
  if (values.name.trim().length === 0) {
    return { ok: false, message: 'Ingresa un nombre.' };
  }

  const regularSalePrice = parseNonNegativeMoney(values.regularSalePrice);

  if (regularSalePrice === null) {
    return { ok: false, message: 'Usa un precio habitual válido.' };
  }

  const initialStock = parseNonNegativeSafeInteger(values.initialStock);

  if (initialStock === null) {
    return {
      ok: false,
      message: 'Usa un stock inicial entero y no negativo.',
    };
  }

  let initialUnitCost: Money | null = null;

  if (initialStock > 0) {
    if (values.initialUnitCost.trim().length === 0) {
      return {
        ok: false,
        message: 'El costo es obligatorio cuando hay stock inicial.',
      };
    }

    initialUnitCost = parseNonNegativeMoney(values.initialUnitCost);

    if (initialUnitCost === null) {
      return { ok: false, message: 'Usa un costo inicial válido.' };
    }
  }

  const minimumStock =
    values.minimumStock.trim().length === 0
      ? null
      : parseNonNegativeSafeInteger(values.minimumStock);

  if (minimumStock === null && values.minimumStock.trim().length > 0) {
    return {
      ok: false,
      message: 'Usa un stock mínimo entero y no negativo.',
    };
  }

  return {
    ok: true,
    input: {
      name: values.name,
      variant: optionalText(values.variant),
      barcode: optionalText(values.barcode),
      regularSalePrice,
      minimumStock,
      initialStock,
      initialUnitCost,
    },
  };
}

export function formatMoneyForDisplay(money: Money, currency: string): string {
  const isNegative = money.scaledUnits < 0;
  const magnitude = Math.abs(money.scaledUnits);
  const internalUnitsPerCent = 10_000;
  let cents = Math.floor(magnitude / internalUnitsPerCent);

  if (magnitude % internalUnitsPerCent >= internalUnitsPerCent / 2) {
    cents += 1;
  }

  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, '0');
  const sign = isNegative ? '-' : '';

  return `${currency.trim().toUpperCase()} ${sign}${whole}.${fraction}`;
}
