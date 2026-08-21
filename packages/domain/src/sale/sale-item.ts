import { Money } from '../money/index';
import { calculateEstimatedProfit } from '../pricing/index';
import { createTimestampMs, type TimestampMs } from '../timestamp/index';

export type CostStatus = 'KNOWN' | 'UNKNOWN';

export interface SaleItem {
  readonly id: string;
  readonly saleId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly unitSalePrice: Money;
  readonly subtotal: Money;
  readonly unitCostSnapshot: Money | null;
  readonly estimatedCost: Money | null;
  readonly estimatedProfit: Money | null;
  readonly costStatus: CostStatus;
  readonly createdAt: TimestampMs;
  readonly updatedAt: TimestampMs;
}

export interface CreateSaleItemInput {
  readonly id: string;
  readonly saleId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly unitSalePrice: Money;
  readonly subtotal: Money;
  readonly unitCostSnapshot: Money | null;
  readonly estimatedCost: Money | null;
  readonly estimatedProfit: Money | null;
  readonly costStatus: CostStatus;
  readonly createdAt: TimestampMs;
  readonly updatedAt: TimestampMs;
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

function validateQuantity(quantity: number): void {
  if (!Number.isSafeInteger(quantity)) {
    throw new RangeError('Sale item quantity must be a safe integer.');
  }

  if (quantity <= 0) {
    throw new RangeError('Sale item quantity must be greater than zero.');
  }
}

function validateCostStatus(status: CostStatus): void {
  if (status !== 'KNOWN' && status !== 'UNKNOWN') {
    throw new RangeError('Cost status must be KNOWN or UNKNOWN.');
  }
}

function validateKnownCost({
  quantity,
  subtotal,
  unitCostSnapshot,
  estimatedCost,
  estimatedProfit,
}: CreateSaleItemInput): void {
  if (
    unitCostSnapshot === null ||
    estimatedCost === null ||
    estimatedProfit === null
  ) {
    throw new RangeError(
      'Known cost snapshot, estimated cost and estimated profit are required.',
    );
  }

  if (unitCostSnapshot.compare(Money.zero()) < 0) {
    throw new RangeError('Unit cost snapshot must not be negative.');
  }

  const expectedCost = unitCostSnapshot.multiplyByInteger(quantity);

  if (!estimatedCost.equals(expectedCost)) {
    throw new RangeError(
      'Estimated cost must equal unit cost snapshot times quantity.',
    );
  }

  const expectedProfit = calculateEstimatedProfit({
    salePrice: subtotal,
    estimatedUnitCost: estimatedCost,
  });

  if (!estimatedProfit.equals(expectedProfit)) {
    throw new RangeError(
      'Estimated profit must equal subtotal minus estimated cost.',
    );
  }
}

function validateUnknownCost({
  unitCostSnapshot,
  estimatedCost,
  estimatedProfit,
}: CreateSaleItemInput): void {
  if (
    unitCostSnapshot !== null ||
    estimatedCost !== null ||
    estimatedProfit !== null
  ) {
    throw new RangeError(
      'Unknown cost requires unit cost snapshot and estimates to be null.',
    );
  }
}

export function createSaleItem(input: CreateSaleItemInput): SaleItem {
  const {
    id,
    saleId,
    productId,
    quantity,
    unitSalePrice,
    subtotal,
    unitCostSnapshot,
    estimatedCost,
    estimatedProfit,
    costStatus,
    createdAt,
    updatedAt,
  } = input;

  validateQuantity(quantity);

  if (unitSalePrice.compare(Money.zero()) <= 0) {
    throw new RangeError('Unit sale price must be greater than zero.');
  }

  const expectedSubtotal = unitSalePrice.multiplyByInteger(quantity);

  if (!subtotal.equals(expectedSubtotal)) {
    throw new RangeError('Subtotal must equal unit sale price times quantity.');
  }

  validateCostStatus(costStatus);

  if (costStatus === 'KNOWN') {
    validateKnownCost(input);
  } else {
    validateUnknownCost(input);
  }

  const normalizedCreatedAt = createTimestampMs(createdAt, 'Created at');
  const normalizedUpdatedAt = createTimestampMs(updatedAt, 'Updated at');

  if (normalizedUpdatedAt < normalizedCreatedAt) {
    throw new RangeError('Updated at must not be before created at.');
  }

  return Object.freeze({
    id: normalizeRequiredIdentifier(id, 'Sale item ID'),
    saleId: normalizeRequiredIdentifier(saleId, 'Sale ID'),
    productId: normalizeRequiredIdentifier(productId, 'Product ID'),
    quantity,
    unitSalePrice,
    subtotal,
    unitCostSnapshot,
    estimatedCost,
    estimatedProfit,
    costStatus,
    createdAt: normalizedCreatedAt,
    updatedAt: normalizedUpdatedAt,
  });
}
