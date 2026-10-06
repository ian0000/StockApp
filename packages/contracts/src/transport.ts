import type { FromSchema } from 'json-schema-to-ts';

// Lexicographic decimal branches enforce the safe range without floating-point arithmetic.
function safeMagnitudePattern(): string {
  const maximum = String(Number.MAX_SAFE_INTEGER);
  const branches = ['[1-9][0-9]{0,14}', maximum];
  for (let index = 0; index < maximum.length; index++) {
    const low = index === 0 ? 1 : 0;
    const high = Number(maximum[index]) - 1;
    if (high < low) continue;
    const digit = low === high ? String(low) : `[${low}-${high}]`;
    branches.push(
      maximum.slice(0, index) + digit + `[0-9]{${maximum.length - index - 1}}`,
    );
  }
  return `(?:${branches.join('|')})`;
}

export const moneySchema = {
  type: 'string',
  pattern: `^(?:0|-?${safeMagnitudePattern()})(?![\\s\\S])`,
  maxLength: 17,
} as const;
export const nonnegativeMoneySchema = {
  ...moneySchema,
  pattern: `^(?:0|${safeMagnitudePattern()})(?![\\s\\S])`,
} as const;
export const positiveMoneySchema = {
  ...moneySchema,
  pattern: `^${safeMagnitudePattern()}(?![\\s\\S])`,
} as const;
export const percentageSchema = {
  ...moneySchema,
  description: 'Safe scaled integer string, 10^6 units per percentage point.',
} as const;
export const stockSchema = {
  type: 'integer',
  minimum: Number.MIN_SAFE_INTEGER,
  maximum: Number.MAX_SAFE_INTEGER,
} as const;
export const nonnegativeStockSchema = { ...stockSchema, minimum: 0 } as const;
export const quantitySchema = { ...stockSchema, minimum: 1 } as const;
export const uuidSchema = {
  type: 'string',
  pattern:
    '^(?:00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})(?![\\s\\S])',
} as const;
export const uuidV7Schema = {
  type: 'string',
  pattern:
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-7[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}(?![\\s\\S])',
} as const;
export const PROTOCOL_VERSION = 1 as const;
export const DOMAIN_VERSION = 1 as const;
export const protocolVersionSchema = {
  type: 'integer',
  const: PROTOCOL_VERSION,
} as const;
export const domainVersionSchema = {
  type: 'integer',
  const: DOMAIN_VERSION,
} as const;
export const cursorSchema = {
  type: 'string',
  minLength: 1,
  description: 'Opaque scoped cursor; consumers never interpret its contents.',
} as const;
export type PercentageTransport = FromSchema<typeof percentageSchema>;
export type UUID = FromSchema<typeof uuidSchema>;
export type UUIDv7 = FromSchema<typeof uuidV7Schema>;
export const decodePercentage = decodeMoney;
export const encodePercentage = encodeMoney;

export function decodeUuid(value: unknown, version?: 7): UUID {
  const schema = version === 7 ? uuidV7Schema : uuidSchema;
  if (typeof value !== 'string' || !new RegExp(schema.pattern).test(value))
    throw new TypeError('Expected a valid UUID.');
  return value;
}
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
