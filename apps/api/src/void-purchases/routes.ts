import type { FastifyInstance } from 'fastify';
import {
  contractSchemas,
  decodeCommandEnvelope,
  createApiError,
  type CommandEnvelopeV1,
} from '@stock-app/contracts';
import type { StockAppAuth } from '../auth/create-auth.js';
import {
  resolveCloudInventory,
  type OwnershipDatabase,
} from '../ownership/context.js';
import { OwnershipError } from '../ownership/errors.js';
import { authorizeBusinessRequest } from '../security/business.js';
import { CommandError } from '../commands/errors.js';
import {
  requireIdempotencyKey,
  commandFingerprint,
} from '../commands/fingerprint.js';
import { createCommandExecutor } from '../infrastructure/postgres/command-executor.js';
import { executeVoidPurchaseCommand } from './execute.js';
import { reconstructVoidPurchaseResult } from './results.js';
import { loadOriginalPurchaseMovements } from './mappers.js';

export function registerVoidPurchaseRoutes(
  app: FastifyInstance,
  auth: StockAppAuth,
  database: OwnershipDatabase,
  clock: () => number = Date.now,
): void {
  app.register(async (scoped) => {
    const foundationHandler = scoped.errorHandler;
    scoped.setErrorHandler(function (error, request, reply) {
      if (error instanceof OwnershipError)
        return reply
          .code(error.statusCode)
          .send(createApiError(error.code, error.message, request.id));
      return foundationHandler.call(this, error, request, reply);
    });
    const execute = createCommandExecutor(database, clock);
    scoped.post<{
      Params: { inventoryId: string; purchaseId: string };
      Body: CommandEnvelopeV1;
    }>(
      '/v1/inventories/:inventoryId/purchases/:purchaseId/void',
      {
        schema: {
          params: contractSchemas.PurchaseParams,
          body: contractSchemas.VoidPurchaseCommand,
          response: { 200: contractSchemas.VoidPurchaseResult },
        },
      },
      async (request, reply) => {
        const authenticated = await authorizeBusinessRequest(auth, request);
        let command;
        try {
          command = decodeCommandEnvelope(request.body);
        } catch {
          throw new CommandError(400, 'VALIDATION_ERROR');
        }
        if (
          command.commandKind !== 'PURCHASE_VOID' ||
          typeof command.preconditions.expectedStateRevision !== 'string' ||
          request.params.purchaseId.toLowerCase() !==
            command.payload.purchaseId.toLowerCase()
        )
          throw new CommandError(400, 'VALIDATION_ERROR');
        requireIdempotencyKey(request.headers['idempotency-key'], command);
        const context = await resolveCloudInventory(
            database,
            authenticated,
            request.params.inventoryId,
          ),
          receipt = await execute({
            context,
            command,
            payloadHash: commandFingerprint(context.inventory.id, command),
            requestId: request.id,
            execute: (tx, inventory) =>
              executeVoidPurchaseCommand(tx, inventory.id, command, clock),
          });
        if (receipt.status !== 'ACCEPTED')
          return reply
            .code(
              receipt.error.code === 'NOT_FOUND'
                ? 404
                : receipt.status === 'CONFLICT'
                  ? 409
                  : 422,
            )
            .send({ error: receipt.error });
        return reconstructVoidPurchaseResult(
          receipt,
          command,
          await loadOriginalPurchaseMovements(
            database,
            context.inventory.id,
            command.payload.purchaseId,
          ),
        );
      },
    );
  });
}
