import type { JSONSchema } from 'json-schema-to-ts';

export function objectSchema<
  const P extends Readonly<Record<string, JSONSchema>>,
>(properties: P) {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties) as (keyof P & string)[],
    additionalProperties: false,
  } as const;
}

export function nullable<const S extends JSONSchema>(schema: S) {
  return { anyOf: [schema, { type: 'null' }] } as const;
}

export function arrayOf<const S extends JSONSchema>(items: S) {
  return { type: 'array', items } as const;
}

export const textSchema = { type: 'string', minLength: 1 } as const;
export const optionalTextSchema = nullable({ type: 'string' } as const);
export const booleanSchema = { type: 'boolean' } as const;
export const emptyObjectSchema = objectSchema({});
