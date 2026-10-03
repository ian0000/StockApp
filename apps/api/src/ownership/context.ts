import { fromNodeHeaders } from 'better-auth/node';
import type { IncomingHttpHeaders } from 'node:http';
import { and, eq } from 'drizzle-orm';
import type { StockAppAuth } from '../auth/create-auth.js';
import type { createDatabase } from '../infrastructure/postgres/client.js';
import { businesses, inventories } from '../infrastructure/postgres/schema.js';
import { OwnershipError } from './errors.js';

export type OwnershipDatabase = ReturnType<typeof createDatabase>;

export async function resolveAuthenticatedUser(
  auth: StockAppAuth,
  headers: IncomingHttpHeaders,
) {
  const result = await auth.api.getSession({
    headers: fromNodeHeaders(headers),
  });
  if (!result)
    throw new OwnershipError(
      401,
      'UNAUTHENTICATED',
      'Inicia sesión para continuar.',
    );
  if (!result.user.emailVerified)
    throw new OwnershipError(
      403,
      'EMAIL_NOT_VERIFIED',
      'Verifica tu correo para continuar.',
    );
  return result;
}

export async function resolveOwnDataset(
  database: OwnershipDatabase,
  userId: string,
  inventoryId?: string,
) {
  // Establish scope from the authenticated owner; never query a supplied inventory ID globally.
  const [result] = await database
    .select({ business: businesses, inventory: inventories })
    .from(businesses)
    .leftJoin(
      inventories,
      and(
        eq(inventories.businessId, businesses.id),
        inventoryId ? eq(inventories.id, inventoryId) : undefined,
      ),
    )
    .where(eq(businesses.ownerUserId, userId));
  return result ?? { business: null, inventory: null };
}

export async function resolveCloudInventory(
  database: OwnershipDatabase,
  authenticated: Awaited<ReturnType<typeof resolveAuthenticatedUser>>,
  inventoryId: string,
) {
  const { business, inventory } = await resolveOwnDataset(
    database,
    authenticated.user.id,
    inventoryId,
  );
  if (!business)
    throw new OwnershipError(
      404,
      'NOT_FOUND',
      'No encontramos este inventario.',
    );
  if (business.status !== 'ACTIVE' || !business.cloudAccessEnabled)
    throw new OwnershipError(
      403,
      'CLOUD_ACCESS_DISABLED',
      'El acceso cloud no está habilitado.',
    );
  if (!inventory)
    throw new OwnershipError(
      404,
      'NOT_FOUND',
      'No encontramos este inventario.',
    );
  return { user: authenticated.user, business, inventory } as const;
}
