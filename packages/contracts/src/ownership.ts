import type { FromSchema } from 'json-schema-to-ts';
import {
  arrayOf,
  booleanSchema,
  nullable,
  objectSchema,
  textSchema,
  emptyObjectSchema,
} from './schema.js';
import {
  uuidV7Schema,
  protocolVersionSchema,
  domainVersionSchema,
} from './transport.js';

export const noQuerySchema = emptyObjectSchema;
export const inventoryMetadataSchema = objectSchema({
  id: uuidV7Schema,
  name: textSchema,
  currency: { type: 'string', pattern: '^[A-Z]{3}(?![\\s\\S])' },
  reportingTimeZone: textSchema,
});
export const businessSchema = objectSchema({
  id: uuidV7Schema,
  status: { type: 'string', enum: ['ACTIVE', 'DELETING'] },
  cloudAccessEnabled: booleanSchema,
});
export const identitySchema = objectSchema({
  id: textSchema,
  email: textSchema,
  emailVerified: booleanSchema,
});
export const capabilitiesSchema = objectSchema({
  protocolVersions: {
    ...arrayOf(protocolVersionSchema),
    minItems: 1,
    uniqueItems: true,
  },
  domainVersions: {
    ...arrayOf(domainVersionSchema),
    minItems: 1,
    uniqueItems: true,
  },
});
export const meResponseSchema = objectSchema({
  user: identitySchema,
  business: nullable(businessSchema),
  inventory: nullable(inventoryMetadataSchema),
  capabilities: capabilitiesSchema,
});
export const bootstrapRequestSchema = objectSchema({
  inventoryName: { type: 'string', minLength: 1, maxLength: 200 },
  currency: { type: 'string', pattern: '^[A-Z]{3}(?![\\s\\S])' },
  reportingTimeZone: { type: 'string', minLength: 1, maxLength: 100 },
});
export const bootstrapResponseSchema = objectSchema({
  business: businessSchema,
  inventory: inventoryMetadataSchema,
});
export const csrfResponseSchema = objectSchema({ token: textSchema });
// Keep the existing UUID route validation: an unknown v4 inventory still reaches scoped 404.
export const inventoryParamsSchema = objectSchema({
  inventoryId: {
    type: 'string',
    pattern:
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?![\\s\\S])',
  },
});
export type MeResponse = FromSchema<typeof meResponseSchema>;
export type BootstrapRequest = FromSchema<typeof bootstrapRequestSchema>;
export type BootstrapResponse = FromSchema<typeof bootstrapResponseSchema>;
