import type { resolveAuthenticatedUser } from '../ownership/context.js';
import { OwnershipError } from '../ownership/errors.js';

export function requireRecentAuthentication(
  authenticated: {
    session: Pick<
      Awaited<ReturnType<typeof resolveAuthenticatedUser>>['session'],
      'createdAt'
    >;
  },
  now: number,
): void {
  const createdAt = authenticated.session.createdAt.getTime();
  if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(createdAt))
    throw new Error('Invalid authentication clock.');
  if (now < createdAt)
    throw new Error('Authentication timestamp is in the future.');
  // Better Auth's middleware excludes equality; the frozen StockApp boundary includes it.
  if (now - createdAt > 300000)
    throw new OwnershipError(
      403,
      'SESSION_NOT_FRESH',
      'Vuelve a autenticarte para continuar.',
    );
}
