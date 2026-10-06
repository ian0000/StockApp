import type { FromSchema } from 'json-schema-to-ts';
import {
  booleanSchema,
  emptyObjectSchema,
  nullable,
  objectSchema,
  textSchema,
} from './schema.js';
import {
  stockSchema,
  timestampSchema,
  uuidV7Schema,
  uuidSchema,
  cursorSchema,
} from './transport.js';
import { sha256Schema } from './sync.js';
import { identitySchema } from './ownership.js';
import { backupSchema } from './backup.js';

export const backupFormatReferenceSchema = objectSchema({
  format: { type: 'string', const: 'stockapp-backup' },
  formatVersion: { type: 'integer', const: 1 },
});
export const importReservationSchema = objectSchema({
  inventoryId: uuidSchema,
  backup: backupFormatReferenceSchema,
  sha256: sha256Schema,
  totalBytes: { ...stockSchema, minimum: 1, maximum: 50 * 1024 * 1024 },
  chunkCount: { ...stockSchema, minimum: 1 },
  consent: { type: 'boolean', const: true },
});
export const importChunkSchema = objectSchema({
  sha256: sha256Schema,
  byteLength: { ...stockSchema, minimum: 1, maximum: 1024 * 1024 },
  contents: {
    ...textSchema,
    description:
      'UTF-8 JSON fragment of the existing stockapp-backup formatVersion 1, not an arbitrary staging object.',
  },
});
export const importProgressSchema = objectSchema({
  importId: uuidV7Schema,
  status: {
    type: 'string',
    enum: [
      'RESERVED',
      'UPLOADING',
      'VALIDATING',
      'READY',
      'COMMITTED',
      'CANCELLED',
      'REJECTED',
    ],
  },
  chunkCount: { ...stockSchema, minimum: 1 },
  receivedChunks: { ...stockSchema, minimum: 0 },
  expiresAt: timestampSchema,
});
export const importCommitSchema = objectSchema({ sha256: sha256Schema });
export const importCommitResultSchema = objectSchema({
  importId: uuidV7Schema,
  inventoryId: uuidSchema,
  generation: uuidSchema,
  cursor: cursorSchema,
  status: { type: 'string', const: 'COMMITTED' },
});
export const importCancelResultSchema = objectSchema({
  importId: uuidV7Schema,
  status: { type: 'string', const: 'CANCELLED' },
});
export const accountExportSchema = objectSchema({
  user: identitySchema,
  backup: nullable(backupSchema),
  exportedAt: timestampSchema,
});
export const accountDeletionRequestSchema = emptyObjectSchema;
export const accountDeletionResultSchema = objectSchema({
  status: { type: 'string', const: 'DELETION_REQUESTED' },
  requestedAt: timestampSchema,
  sessionsRevoked: booleanSchema,
});
export type ImportReservation = FromSchema<typeof importReservationSchema>;
export type ImportChunk = FromSchema<typeof importChunkSchema>;
export type ImportProgress = FromSchema<typeof importProgressSchema>;
export type ImportCommitResult = FromSchema<typeof importCommitResultSchema>;
export type ImportCancelResult = FromSchema<typeof importCancelResultSchema>;
export type AccountExport = FromSchema<typeof accountExportSchema>;
export type AccountDeletionRequest = FromSchema<
  typeof accountDeletionRequestSchema
>;
export type AccountDeletionResult = FromSchema<
  typeof accountDeletionResultSchema
>;
