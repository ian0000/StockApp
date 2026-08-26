import {
  Money,
  type AdjustmentCostMode,
  type AdjustmentReason,
} from '@stock-app/domain';

import { normalizeMoneyInput } from '../products/product-form-values';

export interface AdjustmentReasonOption {
  readonly label: string;
  readonly value: AdjustmentReason;
}

export const ALL_ADJUSTMENT_REASONS: readonly AdjustmentReasonOption[] =
  Object.freeze([
    { label: 'Conteo incorrecto', value: 'COUNT_CORRECTION' },
    { label: 'Dañado', value: 'DAMAGED' },
    { label: 'Perdido', value: 'LOST' },
    { label: 'Consumo interno', value: 'INTERNAL_USE' },
    { label: 'Otro', value: 'OTHER' },
  ]);

const POSITIVE_ADJUSTMENT_REASONS = Object.freeze(
  ALL_ADJUSTMENT_REASONS.filter(
    ({ value }) => value === 'COUNT_CORRECTION' || value === 'OTHER',
  ),
);

export type ParseActualStockResult =
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false; readonly message: string };

export function parseActualStock(value: string): ParseActualStockResult {
  const normalized = value.trim();

  if (!/^\d+$/.test(normalized)) {
    return {
      ok: false,
      message: 'Usa una cantidad entera y no negativa.',
    };
  }

  const parsed = Number(normalized);

  if (!Number.isSafeInteger(parsed)) {
    return {
      ok: false,
      message: 'La cantidad ingresada es demasiado grande.',
    };
  }

  return Object.freeze({ ok: true as const, value: parsed });
}

export function deriveAdjustmentDifference(
  currentStock: number,
  actualStock: number,
): number {
  if (
    !Number.isSafeInteger(currentStock) ||
    !Number.isSafeInteger(actualStock)
  ) {
    throw new RangeError('Stock values must be safe integers.');
  }

  const difference = actualStock - currentStock;

  if (!Number.isSafeInteger(difference)) {
    throw new RangeError('Stock difference must be a safe integer.');
  }

  return difference;
}

export function formatSignedDifference(difference: number): string {
  if (!Number.isSafeInteger(difference)) {
    throw new RangeError('Stock difference must be a safe integer.');
  }

  return difference > 0 ? `+${difference}` : String(difference);
}

export function getAdjustmentReasonOptions(
  difference: number | null,
): readonly AdjustmentReasonOption[] {
  return difference !== null && difference > 0
    ? POSITIVE_ADJUSTMENT_REASONS
    : ALL_ADJUSTMENT_REASONS;
}

export function normalizeReasonForDifference(
  reason: AdjustmentReason,
  difference: number | null,
): AdjustmentReason {
  return getAdjustmentReasonOptions(difference).some(
    ({ value }) => value === reason,
  )
    ? reason
    : 'COUNT_CORRECTION';
}

export function getDefaultAdjustmentCostMode(
  currentUnitCost: Money | null,
): AdjustmentCostMode {
  return currentUnitCost === null ? 'CUSTOM_COST' : 'USE_CURRENT_COST';
}

export function parseAdjustmentUnitCost(value: string): Money | null {
  const normalized = normalizeMoneyInput(value);

  if (normalized === null) {
    return null;
  }

  try {
    const cost = Money.fromDecimal(normalized);
    return cost.compare(Money.zero()) >= 0 ? cost : null;
  } catch {
    return null;
  }
}

interface AdjustmentFormEvaluationInput {
  readonly hasSelectedProduct: boolean;
  readonly currentStock: number;
  readonly currentUnitCost: Money | null;
  readonly actualStockText: string;
  readonly reason: AdjustmentReason;
  readonly costMode: AdjustmentCostMode;
  readonly customUnitCostText: string;
  readonly isSubmitting: boolean;
  readonly canPersist: boolean;
}

export interface AdjustmentFormEvaluation {
  readonly actualStock: number | null;
  readonly actualStockError: string | null;
  readonly costError: string | null;
  readonly customUnitCost: Money | null;
  readonly difference: number | null;
  readonly isNoOp: boolean;
  readonly canSubmit: boolean;
}

export function evaluateAdjustmentForm({
  hasSelectedProduct,
  currentStock,
  currentUnitCost,
  actualStockText,
  reason,
  costMode,
  customUnitCostText,
  isSubmitting,
  canPersist,
}: AdjustmentFormEvaluationInput): AdjustmentFormEvaluation {
  const parsedStock = parseActualStock(actualStockText);
  let difference: number | null = null;
  let actualStockError: string | null = null;

  if (parsedStock.ok) {
    try {
      difference = deriveAdjustmentDifference(currentStock, parsedStock.value);
    } catch {
      actualStockError = 'La diferencia de stock es demasiado grande.';
    }
  } else if (actualStockText.length > 0) {
    actualStockError = parsedStock.message;
  }

  const customUnitCost =
    difference !== null && difference > 0 && costMode === 'CUSTOM_COST'
      ? parseAdjustmentUnitCost(customUnitCostText)
      : null;
  let costError: string | null = null;

  if (difference !== null && difference > 0) {
    if (costMode === 'USE_CURRENT_COST' && currentUnitCost === null) {
      costError = 'Este producto aún no tiene un costo conocido.';
    } else if (
      costMode === 'CUSTOM_COST' &&
      customUnitCost === null &&
      customUnitCostText.length > 0
    ) {
      costError = 'Usa un costo unitario válido.';
    }
  }

  const reasonIsValid = getAdjustmentReasonOptions(difference).some(
    ({ value }) => value === reason,
  );
  const positiveCostIsValid =
    difference === null ||
    difference <= 0 ||
    (costMode === 'USE_CURRENT_COST'
      ? currentUnitCost !== null
      : customUnitCost !== null);
  const isNoOp = difference === 0;

  return Object.freeze({
    actualStock: parsedStock.ok ? parsedStock.value : null,
    actualStockError,
    costError,
    customUnitCost,
    difference,
    isNoOp,
    canSubmit:
      hasSelectedProduct &&
      parsedStock.ok &&
      difference !== null &&
      difference !== 0 &&
      reasonIsValid &&
      positiveCostIsValid &&
      !isSubmitting &&
      canPersist,
  });
}

export function adjustmentReasonLabel(reason: AdjustmentReason): string {
  return (
    ALL_ADJUSTMENT_REASONS.find(({ value }) => value === reason)?.label ??
    reason
  );
}
