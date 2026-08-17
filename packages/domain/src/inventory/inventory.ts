import { createTimestampMs, type TimestampMs } from '../timestamp/index';

export interface Inventory {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
  readonly createdAt: TimestampMs;
  readonly updatedAt: TimestampMs;
}

export interface CreateInventoryInput {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
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

function normalizeCurrency(value: string): string {
  const normalized = normalizeRequiredString(value, 'Inventory currency');

  if (!/^[A-Za-z]{3}$/.test(normalized)) {
    throw new TypeError(
      'Inventory currency must contain exactly three ASCII letters.',
    );
  }

  return normalized.toUpperCase();
}

export function createInventory({
  id,
  name,
  currency,
  createdAt,
  updatedAt,
}: CreateInventoryInput): Inventory {
  const normalizedCreatedAt = createTimestampMs(createdAt, 'Created at');
  const normalizedUpdatedAt = createTimestampMs(updatedAt, 'Updated at');

  if (normalizedUpdatedAt < normalizedCreatedAt) {
    throw new RangeError('Updated at must not be before created at.');
  }

  return Object.freeze({
    id: normalizeRequiredString(id, 'Inventory ID'),
    name: normalizeRequiredString(name, 'Inventory name'),
    currency: normalizeCurrency(currency),
    createdAt: normalizedCreatedAt,
    updatedAt: normalizedUpdatedAt,
  });
}
