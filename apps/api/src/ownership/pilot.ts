import { eq, sql } from 'drizzle-orm';
import {
  businesses,
  inventories,
  user,
} from '../infrastructure/postgres/schema.js';
import type { OwnershipDatabase } from './context.js';

export class PilotAccessError extends Error {}

export async function setPilotAccess(
  database: OwnershipDatabase,
  userId: string,
  enabled: boolean,
): Promise<void> {
  await database.transaction(async (tx) => {
    const [owner] = await tx
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .for('update');
    const [business] = await tx
      .select()
      .from(businesses)
      .where(eq(businesses.ownerUserId, userId))
      .for('update');
    if (!owner || !business)
      throw new PilotAccessError('Pilot access preconditions not met.');
    if (enabled) {
      const inventory = await tx
        .select({ id: inventories.id })
        .from(inventories)
        .where(eq(inventories.businessId, business.id))
        .for('update');
      if (
        !owner.emailVerified ||
        business.status !== 'ACTIVE' ||
        inventory.length !== 1
      )
        throw new PilotAccessError('Pilot access preconditions not met.');
    }
    if (business.cloudAccessEnabled === enabled) return;
    await tx
      .update(businesses)
      .set({
        cloudAccessEnabled: enabled,
        updatedAt: sql`greatest(${businesses.updatedAt}, now())`,
      })
      .where(eq(businesses.id, business.id));
  });
}
