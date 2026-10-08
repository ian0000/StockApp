import { eq } from 'drizzle-orm';
import { v7 } from 'uuid';
import {
  businesses,
  inventories,
  user,
} from '../infrastructure/postgres/schema.js';
import type { OwnershipDatabase } from './context.js';
import { OwnershipError } from './errors.js';
import { requireNotDeleting } from '../deletion/access.js';

export type BootstrapInput = {
  inventoryName: string;
  currency: string;
  reportingTimeZone: string;
};

export async function bootstrapEmptyInventory(
  database: OwnershipDatabase,
  userId: string,
  input: BootstrapInput,
  clock: () => number = Date.now,
) {
  const inventoryName = input.inventoryName.trim();
  let validTimeZone = Boolean(input.reportingTimeZone.trim());
  try {
    const timeZone = new Intl.DateTimeFormat('en', {
      timeZone: input.reportingTimeZone,
    }).resolvedOptions().timeZone;
    // Intl also accepts fixed-offset strings in Node 22; those are not IANA names.
    validTimeZone = validTimeZone && !/^[+-]/.test(timeZone);
  } catch {
    validTimeZone = false;
  }
  if (!inventoryName || !/^[A-Z]{3}$/.test(input.currency) || !validTimeZone)
    throw new OwnershipError(
      400,
      'VALIDATION_ERROR',
      'Revisa los datos enviados.',
    );
  return database.transaction(async (tx) => {
    // The identity row exists before onboarding. Lock it to serialize concurrent bootstraps
    // even when there is no Business row yet; uniqueness is the additional DB defense.
    const [owner] = await tx
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .for('update');
    if (!owner)
      throw new OwnershipError(
        401,
        'UNAUTHENTICATED',
        'Inicia sesión para continuar.',
      );
    if (!owner.emailVerified)
      throw new OwnershipError(
        403,
        'EMAIL_NOT_VERIFIED',
        'Verifica tu correo para continuar.',
      );
    const [existing] = await tx
      .select()
      .from(businesses)
      .where(eq(businesses.ownerUserId, userId))
      .for('update');
    if (existing) {
      const [inventory] = await tx
        .select()
        .from(inventories)
        .where(eq(inventories.businessId, existing.id))
        .for('update');
      if (
        existing.status === 'ACTIVE' &&
        inventory &&
        inventory.name === inventoryName &&
        inventory.currency === input.currency &&
        inventory.reportingTimeZone === input.reportingTimeZone
      )
        return { business: existing, inventory, created: false };
      throw new OwnershipError(
        409,
        'BUSINESS_ALREADY_EXISTS',
        'Ya tienes un negocio.',
      );
    }
    await requireNotDeleting(tx, userId);
    const [business] = await tx
      .insert(businesses)
      .values({
        id: v7(),
        ownerUserId: userId,
        status: 'ACTIVE',
        cloudAccessEnabled: false,
      })
      .returning();
    const now = clock();
    if (!Number.isSafeInteger(now) || now < 0)
      throw new Error('Invalid server clock.');
    const [inventory] = await tx
      .insert(inventories)
      .values({
        id: v7(),
        businessId: business.id,
        name: inventoryName,
        currency: input.currency,
        reportingTimeZone: input.reportingTimeZone,
        createdAt: BigInt(now),
        updatedAt: BigInt(now),
      })
      .returning();
    return { business, inventory, created: true };
  });
}
