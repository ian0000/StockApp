import { and, eq, inArray, sql } from 'drizzle-orm';
import { decodeUuid, type AccountDeletionResult } from '@stock-app/contracts';
import type { OwnershipDatabase } from '../ownership/context.js';
import { OwnershipError } from '../ownership/errors.js';
import { CommandError } from '../commands/errors.js';
import {
  businesses,
  inventories,
  deletionRequests,
  user,
  session,
} from '../infrastructure/postgres/schema.js';
import { serverTime, suppressionIdentifier } from './model.js';

export async function requestDeletion(
  database: OwnershipDatabase,
  input: {
    userId: string;
    key: string;
    secret: string;
    requireVerified?: boolean;
  },
  clock: () => number = Date.now,
): Promise<AccountDeletionResult> {
  const key = decodeUuid(input.key, 7).toLowerCase();
  return database.transaction(async (tx) => {
    const [owner] = await tx
      .select()
      .from(user)
      .where(eq(user.id, input.userId))
      .for('update');
    if (!owner)
      throw new OwnershipError(
        401,
        'UNAUTHENTICATED',
        'Inicia sesión para continuar.',
      );
    if (input.requireVerified !== false && !owner.emailVerified)
      throw new OwnershipError(
        403,
        'EMAIL_NOT_VERIFIED',
        'Verifica tu correo para continuar.',
      );
    const [business] = await tx
      .select()
      .from(businesses)
      .where(eq(businesses.ownerUserId, owner.id))
      // Compatible with FK KEY SHARE taken by an earlier command's receipt insert.
      // A full UPDATE lock here would deadlock while waiting for that command's Inventory lock.
      .for('no key update');
    if (business)
      await tx
        .select({ id: inventories.id })
        .from(inventories)
        .where(eq(inventories.businessId, business.id))
        .for('update');
    // Check the supplied key even if this owner already has another active intention.
    const [keyed] = await tx
      .select()
      .from(deletionRequests)
      .where(eq(deletionRequests.id, key));
    if (
      keyed &&
      (keyed.userId !== owner.id ||
        !['REQUESTED', 'PROCESSING'].includes(keyed.status))
    )
      throw new CommandError(409, 'IDEMPOTENCY_KEY_REUSED');
    const active = await tx
      .select()
      .from(deletionRequests)
      .where(
        and(
          eq(deletionRequests.userId, owner.id),
          inArray(deletionRequests.status, ['REQUESTED', 'PROCESSING']),
        ),
      );
    if (active.length > 1) throw new Error('Inconsistent deletion requests.');
    let existing = keyed ?? active[0];
    const now = serverTime(clock);
    if (!existing) {
      // A different owner may concurrently use the same UUID. Resolve the unique collision
      // without turning an expected incompatible key into an unexpected SQL error.
      const [inserted] = await tx
        .insert(deletionRequests)
        .values({
          id: key,
          userId: owner.id,
          status: 'REQUESTED',
          progress: { phase: 'REVOKE', attempts: 0 },
          suppressionIdentifier: suppressionIdentifier(input.secret, owner.id),
          requestedAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning();
      if (!inserted) throw new CommandError(409, 'IDEMPOTENCY_KEY_REUSED');
      existing = inserted;
    }
    if (business)
      await tx
        .update(businesses)
        .set({
          status: 'DELETING',
          cloudAccessEnabled: false,
          updatedAt: sql`greatest(${businesses.updatedAt}, ${now.toISOString()}::timestamptz)`,
        })
        .where(eq(businesses.id, business.id));
    await tx.delete(session).where(eq(session.userId, owner.id));
    return {
      status: 'DELETION_REQUESTED',
      requestedAt: existing.requestedAt.getTime(),
      sessionsRevoked: true,
    };
  });
}
