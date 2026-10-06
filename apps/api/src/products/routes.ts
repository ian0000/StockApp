import type { FastifyInstance } from 'fastify';
import {
  contractSchemas,
  decodeCommandEnvelope,
  type ProductParams,
  type CommandEnvelopeV1,
  createApiError,
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
  commandFingerprint,
  requireIdempotencyKey,
} from '../commands/fingerprint.js';
import { createCommandExecutor } from '../infrastructure/postgres/command-executor.js';
import { executeProductCommand } from './execute.js';
import { reconstructProductResult } from './results.js';

export function registerProductRoutes(
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
    const executor = createCommandExecutor(database, clock);
    const routes = [
      {
        method: 'POST',
        url: '/v1/inventories/:inventoryId/products',
        kind: 'PRODUCT_CREATE',
        body: contractSchemas.CreateProductCommand,
        params: contractSchemas.InventoryParams,
        response: contractSchemas.CreateProductResult,
      },
      {
        method: 'PATCH',
        url: '/v1/inventories/:inventoryId/products/:productId',
        kind: 'PRODUCT_UPDATE',
        body: contractSchemas.UpdateProductCommand,
        params: contractSchemas.ProductParams,
        response: contractSchemas.ProductMutationResult,
      },
      {
        method: 'POST',
        url: '/v1/inventories/:inventoryId/products/:productId/archive',
        kind: 'PRODUCT_ARCHIVE',
        body: contractSchemas.ArchiveProductCommand,
        params: contractSchemas.ProductParams,
        response: contractSchemas.ProductMutationResult,
      },
    ] as const;
    for (const route of routes)
      scoped.route<{
        Params: Omit<ProductParams, 'productId'> & { productId?: string };
        Body: CommandEnvelopeV1;
      }>({
        method: route.method,
        url: route.url,
        bodyLimit: 32 * 1024,
        schema: {
          body: route.body,
          params: route.params,
          response: { 200: route.response },
        },
        async handler(request, reply) {
          const authenticated = await authorizeBusinessRequest(auth, request);
          let command;
          try {
            command = decodeCommandEnvelope(request.body);
          } catch {
            throw new CommandError(400, 'VALIDATION_ERROR');
          }
          if (command.commandKind !== route.kind)
            throw new CommandError(400, 'VALIDATION_ERROR');
          if (
            command.commandKind !== 'PRODUCT_CREATE' &&
            command.commandKind !== 'PRODUCT_UPDATE' &&
            command.commandKind !== 'PRODUCT_ARCHIVE'
          )
            throw new CommandError(400, 'VALIDATION_ERROR');
          requireIdempotencyKey(request.headers['idempotency-key'], command);
          if (
            request.params.productId &&
            request.params.productId.toLowerCase() !==
              command.payload.productId.toLowerCase()
          )
            throw new CommandError(400, 'VALIDATION_ERROR');
          const context = await resolveCloudInventory(
            database,
            authenticated,
            request.params.inventoryId,
          );
          const receipt = await executor({
            context,
            command,
            payloadHash: commandFingerprint(context.inventory.id, command),
            requestId: request.id,
            execute: (tx, inventory) =>
              executeProductCommand(tx, inventory.id, command, clock),
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
          return reconstructProductResult(receipt, command);
        },
      });
  });
}
