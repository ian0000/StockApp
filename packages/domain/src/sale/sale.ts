import { Money } from '../money/index';
import { calculateEstimatedProfit } from '../pricing/index';
import { createTimestampMs, type TimestampMs } from '../timestamp/index';

export type SaleStatus = 'CONFIRMED' | 'VOIDED';

export interface Sale {
  readonly id: string;
  readonly inventoryId: string;
  readonly effectiveAt: TimestampMs;
  readonly createdAt: TimestampMs;
  readonly updatedAt: TimestampMs;
  readonly status: SaleStatus;
  readonly totalAmount: Money;
  readonly estimatedCost: Money | null;
  readonly estimatedProfit: Money | null;
  readonly notes: string | null;
}

export interface CreateSaleInput {
  readonly id: string;
  readonly inventoryId: string;
  readonly effectiveAt: TimestampMs;
  readonly createdAt: TimestampMs;
  readonly updatedAt: TimestampMs;
  readonly status: SaleStatus;
  readonly totalAmount: Money;
  readonly estimatedCost: Money | null;
  readonly estimatedProfit: Money | null;
  readonly notes?: string | null;
}

function normalizeRequiredIdentifier(value: string, label: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${label} must be a string.`);
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new TypeError(`${label} must not be empty.`);
  }

  return normalized;
}

function normalizeNotes(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new TypeError('Sale notes must be a string or null.');
  }

  const normalized = value.trim();

  return normalized.length === 0 ? null : normalized;
}

function validateStatus(status: SaleStatus): void {
  if (status !== 'CONFIRMED' && status !== 'VOIDED') {
    throw new RangeError('Sale status must be CONFIRMED or VOIDED.');
  }
}

function validateFinancialSnapshots({
  totalAmount,
  estimatedCost,
  estimatedProfit,
}: Pick<
  CreateSaleInput,
  'totalAmount' | 'estimatedCost' | 'estimatedProfit'
>): void {
  if (totalAmount.compare(Money.zero()) <= 0) {
    throw new RangeError('Sale total amount must be greater than zero.');
  }

  if ((estimatedCost === null) !== (estimatedProfit === null)) {
    throw new RangeError(
      'Sale estimated cost and estimated profit must be provided together or both be null.',
    );
  }

  if (estimatedCost === null || estimatedProfit === null) {
    return;
  }

  if (estimatedCost.compare(Money.zero()) < 0) {
    throw new RangeError('Sale estimated cost must not be negative.');
  }

  const expectedProfit = calculateEstimatedProfit({
    salePrice: totalAmount,
    estimatedUnitCost: estimatedCost,
  });

  if (!estimatedProfit.equals(expectedProfit)) {
    throw new RangeError(
      'Sale estimated profit must equal total amount minus estimated cost.',
    );
  }
}

export function createSale({
  id,
  inventoryId,
  effectiveAt,
  createdAt,
  updatedAt,
  status,
  totalAmount,
  estimatedCost,
  estimatedProfit,
  notes,
}: CreateSaleInput): Sale {
  validateStatus(status);
  validateFinancialSnapshots({ totalAmount, estimatedCost, estimatedProfit });

  const normalizedCreatedAt = createTimestampMs(createdAt, 'Created at');
  const normalizedUpdatedAt = createTimestampMs(updatedAt, 'Updated at');

  if (normalizedUpdatedAt < normalizedCreatedAt) {
    throw new RangeError('Updated at must not be before created at.');
  }

  return Object.freeze({
    id: normalizeRequiredIdentifier(id, 'Sale ID'),
    inventoryId: normalizeRequiredIdentifier(inventoryId, 'Inventory ID'),
    effectiveAt: createTimestampMs(effectiveAt, 'Effective at'),
    createdAt: normalizedCreatedAt,
    updatedAt: normalizedUpdatedAt,
    status,
    totalAmount,
    estimatedCost,
    estimatedProfit,
    notes: normalizeNotes(notes),
  });
}
