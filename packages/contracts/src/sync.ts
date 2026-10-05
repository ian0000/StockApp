import type { FromSchema } from 'json-schema-to-ts';
import {
  arrayOf,
  booleanSchema,
  nullable,
  objectSchema,
  textSchema,
} from './schema.js';
import {
  cursorSchema,
  domainVersionSchema,
  protocolVersionSchema,
  revisionSchema,
  timestampSchema,
  uuidV7Schema,
} from './transport.js';
import { commandEnvelopeSchema } from './commands.js';
import {
  adjustmentSchema,
  inventoryStateSchema,
  movementSchema,
  productSchema,
  purchaseSchema,
  saleItemSchema,
  saleSchema,
} from './entities.js';
import { apiErrorSchema } from './http.js';

export const MAX_SYNC_COMMANDS = 50;
export const MAX_CHANGESETS = 50;
export const CHANGESET_RETENTION_DAYS = 90;
export const SNAPSHOT_TTL_HOURS = 24;
export const deviceRegistrationSchema = objectSchema({
  deviceId: uuidV7Schema,
  protocolVersion: protocolVersionSchema,
  domainVersion: domainVersionSchema,
});
export const deviceRegistrationResultSchema = objectSchema({
  deviceId: uuidV7Schema,
  inventoryId: uuidV7Schema,
});
export const changeUpsertsSchema = objectSchema({
  products: arrayOf(productSchema),
  inventoryStates: arrayOf(inventoryStateSchema),
  sales: arrayOf(saleSchema),
  saleItems: arrayOf(saleItemSchema),
  purchases: arrayOf(purchaseSchema),
  stockAdjustments: arrayOf(adjustmentSchema),
  inventoryMovements: arrayOf(movementSchema),
});
// V1 has no financial hard-delete command. Lifecycle tombstone types require API-10's contract.
export const tombstonesSchema = {
  type: 'array',
  items: false,
  maxItems: 0,
  description:
    'Empty in V1: archived products and voided operations are upserts. No financial deletion semantics.',
} as const;
export const changeSetSchema = objectSchema({
  inventoryId: uuidV7Schema,
  revision: revisionSchema,
  serverRecordedAt: timestampSchema,
  upserts: changeUpsertsSchema,
  tombstones: tombstonesSchema,
});
const resultIdentity = { operationId: uuidV7Schema } as const;
export const pushCommandResultSchema = {
  oneOf: [
    objectSchema({
      ...resultIdentity,
      status: { type: 'string', const: 'ACCEPTED' },
      changeSet: changeSetSchema,
    }),
    objectSchema({
      ...resultIdentity,
      status: { type: 'string', const: 'CONFLICT' },
      error: apiErrorSchema.properties.error,
    }),
    objectSchema({
      ...resultIdentity,
      status: { type: 'string', const: 'REJECTED' },
      error: apiErrorSchema.properties.error,
    }),
    objectSchema({
      ...resultIdentity,
      status: { type: 'string', const: 'DEPENDENCY_BLOCKED' },
      dependsOn: { ...arrayOf(uuidV7Schema), minItems: 1 },
      retryable: { type: 'boolean', const: true },
    }),
  ],
} as const;
export const pushRequestSchema = objectSchema({
  deviceId: uuidV7Schema,
  commands: {
    ...arrayOf(commandEnvelopeSchema),
    minItems: 1,
    maxItems: MAX_SYNC_COMMANDS,
  },
});
export const pushResponseSchema = objectSchema({
  results: { ...arrayOf(pushCommandResultSchema), maxItems: MAX_SYNC_COMMANDS },
});
export const changesQuerySchema = objectSchema({
  deviceId: uuidV7Schema,
  cursor: cursorSchema,
});
export const changesResponseSchema = objectSchema({
  inventoryId: uuidV7Schema,
  highWaterMark: revisionSchema,
  changeSets: { ...arrayOf(changeSetSchema), maxItems: MAX_CHANGESETS },
  nextCursor: nullable(cursorSchema),
  hasMore: booleanSchema,
});
export const snapshotRequestSchema = objectSchema({ deviceId: uuidV7Schema });
export const snapshotDescriptorSchema = objectSchema({
  snapshotId: uuidV7Schema,
  inventoryId: uuidV7Schema,
  highWaterMark: revisionSchema,
  expiresAt: timestampSchema,
  cursor: cursorSchema,
});
export const snapshotPageQuerySchema = objectSchema({
  deviceId: uuidV7Schema,
  cursor: cursorSchema,
});
export const snapshotPageSchema = objectSchema({
  snapshotId: uuidV7Schema,
  inventoryId: uuidV7Schema,
  highWaterMark: revisionSchema,
  upserts: changeUpsertsSchema,
  nextCursor: nullable(cursorSchema),
  complete: booleanSchema,
});
export const operationReceiptSchema = {
  oneOf: [
    objectSchema({
      operationId: uuidV7Schema,
      status: { type: 'string', const: 'ACCEPTED' },
      changeSet: changeSetSchema,
    }),
    objectSchema({
      operationId: uuidV7Schema,
      status: { type: 'string', enum: ['CONFLICT', 'REJECTED'] },
      error: apiErrorSchema.properties.error,
    }),
  ],
} as const;
export const sha256Schema = {
  ...textSchema,
  pattern: '^[0-9a-f]{64}(?![\\s\\S])',
} as const;
export type ChangeSet = FromSchema<typeof changeSetSchema>;
export type PushCommandResult = FromSchema<typeof pushCommandResultSchema>;
export type DeviceRegistration = FromSchema<typeof deviceRegistrationSchema>;
export type PushRequest = FromSchema<typeof pushRequestSchema>;
export type PushResponse = FromSchema<typeof pushResponseSchema>;
export type ChangesResponse = FromSchema<typeof changesResponseSchema>;
export type SnapshotDescriptor = FromSchema<typeof snapshotDescriptorSchema>;
export type SnapshotPage = FromSchema<typeof snapshotPageSchema>;
export type OperationReceipt = FromSchema<typeof operationReceiptSchema>;
