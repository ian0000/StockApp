import type { FastifyInstance } from 'fastify';
import {
  contractSchemas,
  createApiError,
  decodeUuid,
} from '@stock-app/contracts';
import type { StockAppAuth } from '../auth/create-auth.js';
import type { OwnershipDatabase } from '../ownership/context.js';
import { OwnershipError } from '../ownership/errors.js';
import { CommandError } from '../commands/errors.js';
import { authorizeBusinessRequest } from '../security/business.js';
import { requireRecentAuthentication } from '../backup/recent-auth.js';
import { requestDeletion } from './request.js';

export function registerDeletionRoutes(
  app: FastifyInstance,
  auth: StockAppAuth,
  database: OwnershipDatabase,
  secret: string,
  wake: () => void = () => {},
  clock: () => number = Date.now,
): void {
  app.register(async (scoped) => {
    const foundation = scoped.errorHandler;
    scoped.setErrorHandler(function (error, request, reply) {
      if (error instanceof OwnershipError)
        return reply
          .code(error.statusCode)
          .send(createApiError(error.code, error.message, request.id));
      return foundation.call(this, error, request, reply);
    });
    scoped.post(
      '/v1/me/deletion',
      {
        schema: {
          body: contractSchemas.AccountDeletionRequest,
          querystring: contractSchemas.NoQuery,
          response: { 202: contractSchemas.AccountDeletionResult },
        },
      },
      async (request, reply) => {
        const authenticated = await authorizeBusinessRequest(auth, request);
        requireRecentAuthentication(authenticated, clock());
        let key: string;
        try {
          key = decodeUuid(request.headers['idempotency-key'], 7);
        } catch {
          throw new CommandError(400, 'VALIDATION_ERROR');
        }
        const result = await requestDeletion(
          database,
          { userId: authenticated.user.id, key, secret },
          clock,
        );
        wake();
        return reply.code(202).send(result);
      },
    );
  });
}
