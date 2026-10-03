import type { FastifyRequest } from 'fastify';
import type { StockAppAuth } from '../auth/create-auth.js';
import { resolveAuthenticatedUser } from '../ownership/context.js';
import { SecurityError } from './policy.js';

export async function authorizeBusinessRequest(
  auth: StockAppAuth,
  request: FastifyRequest,
) {
  const authenticated = await resolveAuthenticatedUser(auth, request.headers);
  const command = !['GET', 'HEAD'].includes(request.method);
  const limit = await auth.security.consume(
    command ? 'business-command-user' : 'business-read-user',
    authenticated.user.id,
    { window: 60, max: command ? 60 : 120 },
  );
  if (!limit.allowed)
    throw new SecurityError(429, 'RATE_LIMITED', limit.retryAfter ?? 60);
  if (command)
    auth.security.verifyCsrf(
      authenticated.session.id,
      request.headers['x-csrf-token'],
    );
  return authenticated;
}
