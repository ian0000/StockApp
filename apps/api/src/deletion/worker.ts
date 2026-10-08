import { and, eq, lte, notInArray, or, sql } from 'drizzle-orm';
import type { OwnershipDatabase } from '../ownership/context.js';
import type { CommandTransaction } from '../infrastructure/postgres/command-executor.js';
import {
  businesses,
  inventories,
  deletionRequests,
  user,
  session,
  account,
  verification,
  importSessions,
  inventoryChangeSets,
  operationReceipts,
  syncDevices,
  stockAdjustments,
  inventoryStates,
  inventoryMovements,
  saleItems,
  sales,
  purchases,
  products,
} from '../infrastructure/postgres/schema.js';
import {
  phases,
  progress,
  newLease,
  serverTime,
  suppressionIdentifier,
  type Phase,
  type DeletionKeys,
} from './model.js';
import { createRateKeyHasher } from '../security/policy.js';

export const DELETION_LEASE_MS = 60_000;
export interface Claim {
  id: string;
  lease: string;
}
export type DeletionHook = (
  step: string,
  tx: CommandTransaction,
) => Promise<void>;

export async function claimDeletion(
  database: OwnershipDatabase,
  clock: () => number = Date.now,
  excluded: readonly string[] = [],
  onlyId?: string,
): Promise<Claim | null> {
  const now = serverTime(clock);
  return database.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(deletionRequests)
      .where(
        and(
          or(
            eq(deletionRequests.status, 'REQUESTED'),
            and(
              eq(deletionRequests.status, 'PROCESSING'),
              lte(
                deletionRequests.updatedAt,
                new Date(now.getTime() - DELETION_LEASE_MS),
              ),
            ),
          ),
          excluded.length
            ? notInArray(deletionRequests.id, [...excluded])
            : undefined,
          onlyId ? eq(deletionRequests.id, onlyId) : undefined,
        ),
      )
      .orderBy(deletionRequests.requestedAt, deletionRequests.id)
      .limit(1)
      .for('update', { skipLocked: true });
    if (!row) return null;
    const state = progress(row.progress);
    if (state.attempts === Number.MAX_SAFE_INTEGER)
      throw new Error('Deletion attempts overflow.');
    const lease = newLease();
    await tx
      .update(deletionRequests)
      .set({
        status: 'PROCESSING',
        progress: { phase: state.phase, attempts: state.attempts + 1, lease },
        updatedAt: new Date(Math.max(now.getTime(), row.updatedAt.getTime())),
      })
      .where(eq(deletionRequests.id, row.id));
    return { id: row.id, lease };
  });
}

export async function advanceDeletion(
  database: OwnershipDatabase,
  claim: Claim,
  keys: DeletionKeys,
  clock: () => number = Date.now,
  afterWrite: DeletionHook = async () => {},
): Promise<'continue' | 'complete' | 'lost'> {
  const rateHash = createRateKeyHasher(keys.authSecret);
  return database.transaction(async (tx) => {
    // Use the HTTP/bootstrap lock order. Never hold the request lock while waiting for User:
    // a recovery POST holds User before reading/updating this same request.
    const [initial] = await tx
      .select()
      .from(deletionRequests)
      .where(eq(deletionRequests.id, claim.id));
    if (!initial || initial.status !== 'PROCESSING') return 'lost';
    const userId = initial.userId;
    const [owner] = userId
      ? await tx.select().from(user).where(eq(user.id, userId)).for('update')
      : [];
    const [business] = userId
      ? await tx
          .select()
          .from(businesses)
          .where(eq(businesses.ownerUserId, userId))
          .for('update')
      : [];
    const [inventory] = business
      ? await tx
          .select()
          .from(inventories)
          .where(eq(inventories.businessId, business.id))
          .for('update')
      : [];
    const [row] = await tx
      .select()
      .from(deletionRequests)
      .where(eq(deletionRequests.id, claim.id))
      .for('update');
    if (!row || row.status !== 'PROCESSING' || row.userId !== userId)
      return 'lost';
    const state = progress(row.progress);
    if (state.lease !== claim.lease) return 'lost';
    const now = serverTime(clock);
    let identifier = row.suppressionIdentifier;
    if (owner) {
      const computed = suppressionIdentifier(keys.suppressionSecret, owner.id);
      if (identifier !== null && identifier !== computed)
        throw new Error('Suppression key mismatch.');
      identifier = computed;
    }
    if (!identifier || !/^[a-f0-9]{64}$/.test(identifier))
      throw new Error('Missing deletion suppression.');
    if (business && business.status !== 'DELETING')
      throw new Error('Deletion lifecycle not established.');
    async function done(step: string) {
      await afterWrite(step, tx);
    }
    const phase: Phase = state.phase;
    if (phase === 'FINALIZE' && (owner || business || inventory))
      throw new Error('Deletion purge is incomplete.');
    if (phase === 'REVOKE') {
      if (userId) await tx.delete(session).where(eq(session.userId, userId));
      await done('sessions');
    } else if (phase === 'PURGE_DELIVERY') {
      if (business) {
        await tx
          .delete(importSessions)
          .where(eq(importSessions.businessId, business.id));
        await done('imports');
        if (inventory) {
          await tx
            .delete(inventoryChangeSets)
            .where(eq(inventoryChangeSets.inventoryId, inventory.id));
          await done('changes');
        }
        await tx
          .delete(operationReceipts)
          .where(eq(operationReceipts.businessId, business.id));
        await done('receipts');
        await tx
          .delete(syncDevices)
          .where(eq(syncDevices.businessId, business.id));
        await done('devices');
      }
    } else if (phase === 'PURGE_DATASET') {
      if (inventory) {
        await tx
          .delete(stockAdjustments)
          .where(eq(stockAdjustments.inventoryId, inventory.id));
        await done('adjustments');
        // State points at its last movement; delete it before deleting all movements together.
        await tx
          .delete(inventoryStates)
          .where(eq(inventoryStates.inventoryId, inventory.id));
        await done('states');
        await tx
          .delete(inventoryMovements)
          .where(eq(inventoryMovements.inventoryId, inventory.id));
        await done('movements');
        await tx
          .delete(saleItems)
          .where(eq(saleItems.inventoryId, inventory.id));
        await done('items');
        await tx.delete(sales).where(eq(sales.inventoryId, inventory.id));
        await done('sales');
        await tx
          .delete(purchases)
          .where(eq(purchases.inventoryId, inventory.id));
        await done('purchases');
        await tx.delete(products).where(eq(products.inventoryId, inventory.id));
        await done('products');
        await tx.delete(inventories).where(eq(inventories.id, inventory.id));
        await done('inventory');
      }
      if (business) {
        await tx.delete(businesses).where(eq(businesses.id, business.id));
        await done('business');
      }
    } else if (phase === 'PURGE_AUTH') {
      if (owner) {
        await tx.delete(session).where(eq(session.userId, owner.id));
        await done('auth-sessions');
        await tx.delete(account).where(eq(account.userId, owner.id));
        await done('accounts');
        // The installed email/password reset stores user.id in value. Email identifiers
        // are exact, never substring matches or a global verification cleanup.
        await tx
          .delete(verification)
          .where(
            or(
              eq(verification.value, owner.id),
              eq(verification.identifier, owner.email),
              eq(verification.identifier, `email-verification:${owner.email}`),
            ),
          );
        await done('verifications');
        await tx.execute(sql`DELETE FROM security_rate_limits WHERE (scope, key_hash) IN (
          ${sql.join(
            [
              ['business-read-user', owner.id],
              ['business-command-user', owner.id],
              ['auth-login-email', owner.email.trim().toLowerCase()],
              ['auth-reset-email', owner.email.trim().toLowerCase()],
            ].map(([scope, key]) => sql`(${scope}, ${rateHash(scope!, key!)})`),
            sql`, `,
          )}
        )`);
        await done('security');
        await tx.delete(user).where(eq(user.id, owner.id));
        await done('user');
      }
    }
    const next = phases[phases.indexOf(phase) + 1];
    await tx
      .update(deletionRequests)
      .set({
        status: next ? 'PROCESSING' : 'COMPLETED',
        userId: next ? userId : null,
        suppressionIdentifier: identifier,
        progress: next
          ? { phase: next, attempts: state.attempts, lease: claim.lease }
          : { phase: 'FINALIZE', attempts: state.attempts },
        updatedAt: new Date(Math.max(now.getTime(), row.updatedAt.getTime())),
      })
      .where(eq(deletionRequests.id, row.id));
    await done(`phase:${phase}`);
    return next ? 'continue' : 'complete';
  });
}

export async function releaseFailedDeletion(
  database: OwnershipDatabase,
  claim: Claim,
  clock: () => number = Date.now,
): Promise<void> {
  await database.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(deletionRequests)
      .where(
        and(
          eq(deletionRequests.id, claim.id),
          eq(deletionRequests.status, 'PROCESSING'),
        ),
      )
      .for('update');
    if (!row) return;
    const state = progress(row.progress);
    if (state.lease !== claim.lease) return;
    await tx
      .update(deletionRequests)
      .set({
        status: 'REQUESTED',
        progress: { phase: state.phase, attempts: state.attempts },
        updatedAt: new Date(
          Math.max(serverTime(clock).getTime(), row.updatedAt.getTime()),
        ),
      })
      .where(eq(deletionRequests.id, row.id));
  });
}
