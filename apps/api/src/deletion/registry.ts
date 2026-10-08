import { and, eq, inArray } from 'drizzle-orm';
import { v7 } from 'uuid';
import { createSchemaValidator } from '@stock-app/contracts';
import type { OwnershipDatabase } from '../ownership/context.js';
import { user, deletionRequests } from '../infrastructure/postgres/schema.js';
import { progress, suppressionIdentifier, type DeletionKeys } from './model.js';
import { requestDeletion } from './request.js';
import { advanceDeletion, claimDeletion } from './worker.js';

export interface SuppressionRegistry {
  format: 'stockapp-deletion-suppressions';
  version: 1;
  identifiers: string[];
}
const validate = createSchemaValidator({
  type: 'object',
  properties: {
    format: { type: 'string', const: 'stockapp-deletion-suppressions' },
    version: { type: 'integer', const: 1 },
    identifiers: {
      type: 'array',
      uniqueItems: true,
      items: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    },
  },
  required: ['format', 'version', 'identifiers'],
  additionalProperties: false,
} as const);
export function decodeRegistry(input: unknown): SuppressionRegistry {
  validate(input);
  return input as SuppressionRegistry;
}
export async function exportSuppressionRegistry(
  database: OwnershipDatabase,
): Promise<SuppressionRegistry> {
  const rows = await database
    .select({ identifier: deletionRequests.suppressionIdentifier })
    .from(deletionRequests)
    .where(eq(deletionRequests.status, 'COMPLETED'));
  const identifiers = [
    ...new Set(
      rows.map(({ identifier }) => {
        if (!identifier || !/^[a-f0-9]{64}$/.test(identifier))
          throw new Error('Invalid completed suppression.');
        return identifier;
      }),
    ),
  ].sort();
  return decodeRegistry({
    format: 'stockapp-deletion-suppressions',
    version: 1,
    identifiers,
  });
}
export async function applySuppressionRegistry(
  database: OwnershipDatabase,
  input: unknown,
  keys: DeletionKeys,
): Promise<number> {
  const registry = decodeRegistry(input);
  const identifiers = new Set(registry.identifiers);
  const restored = await database.select({ id: user.id }).from(user);
  let removed = 0;
  for (const restoredUser of restored) {
    if (
      !identifiers.has(
        suppressionIdentifier(keys.suppressionSecret, restoredUser.id),
      )
    )
      continue;
    await requestDeletion(database, {
      userId: restoredUser.id,
      key: v7(),
      secret: keys.suppressionSecret,
      requireVerified: false,
    });
    // Operator-only, before promotion: fence any pre-restore lease and resume its durable phase.
    const requestId = await database.transaction(async (tx) => {
      await tx
        .select({ id: user.id })
        .from(user)
        .where(eq(user.id, restoredUser.id))
        .for('update');
      const [row] = await tx
        .select()
        .from(deletionRequests)
        .where(
          and(
            eq(deletionRequests.userId, restoredUser.id),
            inArray(deletionRequests.status, ['REQUESTED', 'PROCESSING']),
          ),
        )
        .for('update');
      if (!row) throw new Error('Missing restored deletion request.');
      const state = progress(row.progress);
      await tx
        .update(deletionRequests)
        .set({
          status: 'REQUESTED',
          progress: { phase: state.phase, attempts: state.attempts },
        })
        .where(eq(deletionRequests.id, row.id));
      return row.id;
    });
    const claim = await claimDeletion(database, Date.now, [], requestId);
    if (!claim) throw new Error('Restored deletion could not be claimed.');
    while ((await advanceDeletion(database, claim, keys)) === 'continue') {
      /* Durable phases, no retry on error. */
    }
    const [remaining] = await database
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, restoredUser.id));
    if (remaining) throw new Error('Suppression was not fully applied.');
    removed++;
  }
  // Verify matching identities again before the operator can promote the restored database.
  for (const remaining of await database.select({ id: user.id }).from(user)) {
    if (
      identifiers.has(
        suppressionIdentifier(keys.suppressionSecret, remaining.id),
      )
    )
      throw new Error('Restored suppression verification failed.');
  }
  return removed;
}
