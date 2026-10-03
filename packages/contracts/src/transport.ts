import type { FromSchema } from 'json-schema-to-ts';

export const moneySchema = {
  type: 'string',
  pattern: '^(?:0|-?[1-9][0-9]*)(?![\\s\\S])',
  maxLength: 17,
} as const;
export const revisionSchema = {
  type: 'string',
  pattern: '^(?:0|[1-9][0-9]*)(?![\\s\\S])',
} as const;
export const timestampSchema = {
  type: 'integer',
  minimum: 0,
  maximum: Number.MAX_SAFE_INTEGER,
} as const;

export type MoneyTransport = FromSchema<typeof moneySchema>;
export type RevisionTransport = FromSchema<typeof revisionSchema>;
export type TimestampTransport = FromSchema<typeof timestampSchema>;

// JSON Schema checks shape; the codec also enforces the safe range before domain use.
export function decodeMoney(value: unknown): number {
  if (
    typeof value !== 'string' ||
    value.length > 17 ||
    !/^(?:0|-?[1-9][0-9]*)(?![\s\S])/.test(value)
  ) {
    throw new TypeError('Expected canonical scaled integer string.');
  }
  const units = Number(value);
  if (!Number.isSafeInteger(units) || String(units) !== value) {
    throw new TypeError('Scaled integer exceeds safe transport range.');
  }
  return units;
}

export function encodeMoney(units: number): MoneyTransport {
  if (!Number.isSafeInteger(units)) {
    throw new TypeError('Expected safe scaled integer.');
  }
  return String(units);
}

export function decodeRevision(value: unknown): RevisionTransport {
  if (
    typeof value !== 'string' ||
    !/^(?:0|[1-9][0-9]*)(?![\s\S])/.test(value)
  ) {
    throw new TypeError('Expected canonical nonnegative revision string.');
  }
  return value;
}

export function decodeTimestamp(value: unknown): TimestampTransport {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('Expected safe nonnegative epoch milliseconds.');
  }
  return value;
}
