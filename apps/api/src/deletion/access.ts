import { and, eq, inArray } from 'drizzle-orm';
import { deletionRequests } from '../infrastructure/postgres/schema.js';
import type { OwnershipDatabase } from '../ownership/context.js';
import { OwnershipError } from '../ownership/errors.js';

export async function requireNotDeleting(
  database: Pick<OwnershipDatabase, 'select'>,
  userId: string,
): Promise<void> {
  const [request] = await database
    .select({ id: deletionRequests.id })
    .from(deletionRequests)
    .where(
      and(
        eq(deletionRequests.userId, userId),
        inArray(deletionRequests.status, ['REQUESTED', 'PROCESSING']),
      ),
    )
    .limit(1);
  if (request)
    throw new OwnershipError(
      403,
      'CLOUD_ACCESS_DISABLED',
      'El acceso cloud no está habilitado.',
    );
}
