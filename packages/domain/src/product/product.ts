import { Money } from '../money/index';
import { createTimestampMs, type TimestampMs } from '../timestamp/index';

export interface Product {
  readonly id: string;
  readonly inventoryId: string;
  readonly name: string;
  readonly variant: string | null;
  readonly barcode: string | null;
  readonly regularSalePrice: Money;
  readonly minimumStock: number | null;
  readonly isArchived: boolean;
  readonly createdAt: TimestampMs;
  readonly updatedAt: TimestampMs;
}

export interface CreateProductInput {
  readonly id: string;
  readonly inventoryId: string;
  readonly name: string;
  readonly variant?: string | null;
  readonly barcode?: string | null;
  readonly regularSalePrice: Money;
  readonly minimumStock?: number | null;
  readonly createdAt: TimestampMs;
  readonly updatedAt: TimestampMs;
}

function normalizeRequiredString(value: string, label: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${label} must be a string.`);
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new TypeError(`${label} must not be empty.`);
  }

  return normalized;
}

function normalizeOptionalString(
  value: string | null | undefined,
  label: string,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new TypeError(`${label} must be a string.`);
  }

  const normalized = value.trim();

  return normalized.length === 0 ? null : normalized;
}

function normalizeMinimumStock(
  minimumStock: number | null | undefined,
): number | null {
  if (minimumStock === null || minimumStock === undefined) {
    return null;
  }

  if (!Number.isSafeInteger(minimumStock)) {
    throw new RangeError('Minimum stock must be a safe integer.');
  }

  if (minimumStock < 0) {
    throw new RangeError('Minimum stock must not be negative.');
  }

  return minimumStock;
}

export function createProduct({
  id,
  inventoryId,
  name,
  variant,
  barcode,
  regularSalePrice,
  minimumStock,
  createdAt,
  updatedAt,
}: CreateProductInput): Product {
  if (regularSalePrice.compare(Money.zero()) < 0) {
    throw new RangeError('Regular sale price must not be negative.');
  }

  const normalizedCreatedAt = createTimestampMs(createdAt, 'Created at');
  const normalizedUpdatedAt = createTimestampMs(updatedAt, 'Updated at');

  if (normalizedUpdatedAt < normalizedCreatedAt) {
    throw new RangeError('Updated at must not be before created at.');
  }

  return Object.freeze({
    id: normalizeRequiredString(id, 'Product ID'),
    inventoryId: normalizeRequiredString(inventoryId, 'Inventory ID'),
    name: normalizeRequiredString(name, 'Product name'),
    variant: normalizeOptionalString(variant, 'Product variant'),
    barcode: normalizeOptionalString(barcode, 'Product barcode'),
    regularSalePrice,
    minimumStock: normalizeMinimumStock(minimumStock),
    isArchived: false,
    createdAt: normalizedCreatedAt,
    updatedAt: normalizedUpdatedAt,
  });
}
