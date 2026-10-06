import { and, eq, sql } from 'drizzle-orm';
import {
  decodeCommandEnvelope,
  createSchemaValidator,
  operationReceiptSchema,
  type CommandEnvelopeV1,
  type OperationReceipt,
} from '@stock-app/contracts';
import { commandFingerprint } from '../../commands/fingerprint.js';
import { CommandError } from '../../commands/errors.js';
import { OwnershipError } from '../../ownership/errors.js';
import type { resolveCloudInventory } from '../../ownership/context.js';
import type { createDatabase } from './client.js';
import {
  businesses,
  inventories,
  inventoryChangeSets,
  operationReceipts,
  syncDevices,
  user,
} from './schema.js';
import {
  serverDate,
  createChangeSet,
  type CommandChanges,
} from './change-sets.js';
import {
  commandReferences,
  findOperationReceipt,
  terminalReceipt,
  validateAcceptedReferences,
  validateTerminalReferences,
  type AcceptedReferences,
  type TerminalReferences,
} from './command-receipts.js';

type Database = ReturnType<typeof createDatabase>;
export type CommandTransaction = Parameters<
  Parameters<Database['transaction']>[0]
>[0];
export type CloudInventoryContext = Awaited<
  ReturnType<typeof resolveCloudInventory>
>;
export type CommandOutcome =
  | {
      status: 'ACCEPTED';
      changes: CommandChanges;
      references: AcceptedReferences;
    }
  | { status: 'CONFLICT' | 'REJECTED'; references: TerminalReferences };
export type ExecuteCommandInput = {
  context: CloudInventoryContext;
  command: CommandEnvelopeV1;
  payloadHash: string;
  requestId: string;
  execute: (
    tx: CommandTransaction,
    lockedInventory: Readonly<typeof inventories.$inferSelect>,
  ) => Promise<CommandOutcome>;
};
const validateReceipt = createSchemaValidator(operationReceiptSchema);

export function createCommandExecutor(
  database: Database,
  clock: () => number = Date.now,
) {
  return async (input: ExecuteCommandInput): Promise<OperationReceipt> => {
    const command = decodeCommandEnvelope(input.command);
    const { context } = input;
    if (commandFingerprint(context.inventory.id, command) !== input.payloadHash)
      throw new CommandError(400, 'VALIDATION_ERROR');
    return database.transaction(
      async (tx) => {
        const [locked] = await tx
          .select({ inventory: inventories })
          .from(inventories)
          .innerJoin(businesses, eq(businesses.id, inventories.businessId))
          .where(
            and(
              eq(inventories.id, context.inventory.id),
              eq(inventories.businessId, context.business.id),
              eq(businesses.ownerUserId, context.user.id),
            ),
          )
          .for('update', { of: inventories });
        if (!locked)
          throw new OwnershipError(
            404,
            'NOT_FOUND',
            'No encontramos este inventario.',
          );
        const lockedInventory = locked.inventory;
        // Re-read ownership/access after waiting for the Inventory lock; context is not a cached grant.
        const [owner] = await tx
          .select({ business: businesses, verified: user.emailVerified })
          .from(businesses)
          .innerJoin(user, eq(user.id, businesses.ownerUserId))
          .where(
            and(
              eq(businesses.id, context.business.id),
              eq(businesses.ownerUserId, context.user.id),
            ),
          );
        if (!owner)
          throw new OwnershipError(
            404,
            'NOT_FOUND',
            'No encontramos este inventario.',
          );
        if (!owner.verified)
          throw new OwnershipError(
            403,
            'EMAIL_NOT_VERIFIED',
            'Verifica tu correo para continuar.',
          );
        if (
          owner.business.status !== 'ACTIVE' ||
          !owner.business.cloudAccessEnabled
        )
          throw new OwnershipError(
            403,
            'CLOUD_ACCESS_DISABLED',
            'El acceso cloud no está habilitado.',
          );
        const scope = {
          businessId: owner.business.id,
          inventoryId: lockedInventory.id,
        };
        const existing = await findOperationReceipt(
          tx,
          scope,
          command.operationId,
          input.requestId,
        );
        if (existing) {
          if (existing.row.payloadHash !== input.payloadHash)
            throw new CommandError(409, 'IDEMPOTENCY_KEY_REUSED');
          return existing.result;
        }
        const deviceId = command.deviceId ?? null;
        if (deviceId !== null) {
          const [device] = await tx
            .select({ id: syncDevices.id })
            .from(syncDevices)
            .where(
              and(
                eq(syncDevices.businessId, scope.businessId),
                eq(syncDevices.id, deviceId),
              ),
            );
          if (!device) throw new CommandError(400, 'VALIDATION_ERROR');
        }
        const receivedAt = serverDate(clock);
        // A savepoint is on this same connection/Drizzle transaction, never a second transaction.
        // It also guarantees terminal conflict/rejection cannot retain callback writes.
        await tx.execute(sql`SAVEPOINT command_effects`);
        const outcome = await input.execute(tx, lockedInventory);
        let result: OperationReceipt;
        let committedRevision: bigint | null = null;
        if (outcome.status === 'ACCEPTED') {
          validateAcceptedReferences(command.commandKind, outcome.references);
          const expected = commandReferences(command);
          if (
            JSON.stringify(outcome.references).toLowerCase() !==
            JSON.stringify(expected).toLowerCase()
          )
            throw new Error('Inconsistent result reference.');
          committedRevision = lockedInventory.revision + 1n;
          if (committedRevision > 9223372036854775807n)
            throw new Error('Revision overflow.');
          const recorded = serverDate(clock);
          const changeSet = createChangeSet(
            outcome.changes,
            lockedInventory.id,
            committedRevision,
            recorded,
          );
          await tx
            .update(inventories)
            .set({ revision: committedRevision })
            .where(
              and(
                eq(inventories.id, scope.inventoryId),
                eq(inventories.businessId, scope.businessId),
              ),
            );
          await tx.insert(inventoryChangeSets).values({
            inventoryId: scope.inventoryId,
            revision: committedRevision,
            changes: {
              upserts: changeSet.upserts,
              tombstones: changeSet.tombstones,
            },
            serverRecordedAt: recorded,
          });
          result = {
            operationId: command.operationId,
            status: 'ACCEPTED',
            changeSet,
          };
        } else if (
          outcome.status === 'CONFLICT' ||
          outcome.status === 'REJECTED'
        ) {
          validateTerminalReferences(outcome.references, outcome.status);
          await tx.execute(sql`ROLLBACK TO SAVEPOINT command_effects`);
          result = terminalReceipt(
            command.operationId,
            outcome.status,
            outcome.references,
            input.requestId,
          );
        } else throw new Error('Unsupported command outcome.');
        await tx.execute(sql`RELEASE SAVEPOINT command_effects`);
        validateReceipt(result);
        // References, kind, terminal status and revision have all been validated before persistence.
        await tx.insert(operationReceipts).values({
          businessId: scope.businessId,
          operationId: command.operationId,
          payloadHash: input.payloadHash,
          kind: command.commandKind,
          resultCode: outcome.status,
          resultReferences: outcome.references,
          committedRevision,
          deviceId,
          receivedAt,
        });
        return result;
      },
      { isolationLevel: 'read committed' },
    );
  };
}
