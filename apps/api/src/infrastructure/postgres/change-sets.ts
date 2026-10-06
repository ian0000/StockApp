import {
  changeSetSchema,
  createSchemaValidator,
  timestampSchema,
  type ChangeSet,
} from '@stock-app/contracts';
import { inventoryChangeSets } from './schema.js';

export type CommandChanges = Pick<ChangeSet, 'upserts' | 'tombstones'>;
const validate = createSchemaValidator(changeSetSchema);
const validateTime = createSchemaValidator(timestampSchema);
const validateChanges = createSchemaValidator({
  type: 'object',
  properties: {
    upserts: changeSetSchema.properties.upserts,
    tombstones: changeSetSchema.properties.tombstones,
  },
  required: ['upserts', 'tombstones'],
  additionalProperties: false,
});

export function createChangeSet(
  changes: CommandChanges,
  inventoryId: string,
  revision: bigint,
  recordedAt: Date,
): ChangeSet {
  validateChanges(changes);
  return validatedChangeSet(
    {
      inventoryId,
      revision: revision.toString(),
      serverRecordedAt: recordedAt.getTime(),
      ...changes,
    },
    inventoryId,
  );
}

export function serverDate(clock: () => number): Date {
  const time = clock();
  validateTime(time);
  const date = new Date(time);
  if (!Number.isFinite(date.getTime()))
    throw new Error('Invalid server clock.');
  return date;
}

function assertChangeSet(value: unknown): asserts value is ChangeSet {
  validate(value);
}

export function validatedChangeSet(
  value: unknown,
  inventoryId: string,
): ChangeSet {
  assertChangeSet(value);
  if (value.inventoryId.toLowerCase() !== inventoryId.toLowerCase())
    throw new Error('Inconsistent ChangeSet scope.');
  for (const entities of Object.values(value.upserts))
    for (const entity of entities)
      if (entity.inventoryId.toLowerCase() !== inventoryId.toLowerCase())
        throw new Error('Inconsistent upsert scope.');
  return value;
}

export function restoreChangeSet(
  row: typeof inventoryChangeSets.$inferSelect,
  inventoryId: string,
  revision: bigint,
): ChangeSet {
  if (
    typeof row.revision !== 'bigint' ||
    row.revision !== revision ||
    !row.changes ||
    typeof row.changes !== 'object' ||
    Array.isArray(row.changes)
  )
    throw new Error('Inconsistent stored ChangeSet.');
  // Validate JSONB keys separately: spreading only known keys would hide persisted corruption.
  if (Object.keys(row.changes).sort().join(',') !== 'tombstones,upserts')
    throw new Error('Invalid stored changes.');
  return validatedChangeSet(
    {
      inventoryId: row.inventoryId,
      revision: row.revision.toString(),
      serverRecordedAt: row.serverRecordedAt.getTime(),
      ...row.changes,
    },
    inventoryId,
  );
}
