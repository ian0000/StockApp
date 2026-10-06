import type { FastifyInstance } from 'fastify';
import {
  createApiError,
  noQuerySchema,
  bootstrapRequestSchema,
  bootstrapResponseSchema,
  inventoryMetadataSchema,
  inventoryParamsSchema,
  meResponseSchema,
  csrfResponseSchema,
  PROTOCOL_VERSION,
  DOMAIN_VERSION,
  operationParamsSchema,
  operationReceiptSchema,
  type OperationParams,
} from '@stock-app/contracts';
import type { StockAppAuth } from '../auth/create-auth.js';
import { bootstrapEmptyInventory, type BootstrapInput } from './bootstrap.js';
import {
  resolveOwnDataset,
  resolveCloudInventory,
  type OwnershipDatabase,
} from './context.js';
import { OwnershipError } from './errors.js';
import { businesses, inventories } from '../infrastructure/postgres/schema.js';
import { authorizeBusinessRequest } from '../security/business.js';
import { findOperationReceipt } from '../infrastructure/postgres/command-receipts.js';

function inventoryDto(inventory: typeof inventories.$inferSelect) {
  return {
    id: inventory.id,
    name: inventory.name,
    currency: inventory.currency,
    reportingTimeZone: inventory.reportingTimeZone,
  };
}
function businessDto(business: typeof businesses.$inferSelect) {
  return {
    id: business.id,
    status: business.status,
    cloudAccessEnabled: business.cloudAccessEnabled,
  };
}

export function registerOwnershipRoutes(
  app: FastifyInstance,
  auth: StockAppAuth,
  database: OwnershipDatabase,
  clock: () => number = Date.now,
): void {
  app.register(async (scoped) => {
    scoped.addHook('onRequest', async (_request, reply) => {
      reply.header('cache-control', 'no-store');
    });
    // Delegate validation/unexpected failures to the foundation sanitizer.
    const foundationHandler = scoped.errorHandler;
    scoped.setErrorHandler(function (error, request, reply) {
      if (error instanceof OwnershipError)
        return reply
          .code(error.statusCode)
          .send(createApiError(error.code, error.message, request.id));
      return foundationHandler.call(this, error, request, reply);
    });
    scoped.get(
      '/v1/session/csrf',
      {
        schema: {
          querystring: noQuerySchema,
          response: { 200: csrfResponseSchema },
        },
      },
      async (request) => {
        const authenticated = await authorizeBusinessRequest(auth, request);
        return { token: auth.security.csrf(authenticated.session.id) };
      },
    );
    scoped.get(
      '/v1/me',
      {
        schema: {
          querystring: noQuerySchema,
          response: { 200: meResponseSchema },
        },
      },
      async (request) => {
        const authenticated = await authorizeBusinessRequest(auth, request);
        const { business, inventory } = await resolveOwnDataset(
          database,
          authenticated.user.id,
        );
        return {
          user: {
            id: authenticated.user.id,
            email: authenticated.user.email,
            emailVerified: authenticated.user.emailVerified,
          },
          business: business ? businessDto(business) : null,
          inventory: inventory ? inventoryDto(inventory) : null,
          capabilities: {
            protocolVersions: [PROTOCOL_VERSION],
            domainVersions: [DOMAIN_VERSION],
          },
        };
      },
    );
    scoped.post<{ Body: BootstrapInput }>(
      '/v1/business',
      {
        bodyLimit: 32 * 1024,
        schema: {
          body: bootstrapRequestSchema,
          querystring: noQuerySchema,
          response: {
            200: bootstrapResponseSchema,
            201: bootstrapResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const authenticated = await authorizeBusinessRequest(auth, request);
        const result = await bootstrapEmptyInventory(
          database,
          authenticated.user.id,
          request.body,
          clock,
        );
        return reply.code(result.created ? 201 : 200).send({
          business: businessDto(result.business),
          inventory: inventoryDto(result.inventory),
        });
      },
    );
    scoped.get<{ Params: { inventoryId: string } }>(
      '/v1/inventories/:inventoryId',
      {
        schema: {
          querystring: noQuerySchema,
          params: inventoryParamsSchema,
          response: { 200: inventoryMetadataSchema },
        },
      },
      async (request) => {
        const authenticated = await authorizeBusinessRequest(auth, request);
        const context = await resolveCloudInventory(
          database,
          authenticated,
          request.params.inventoryId,
        );
        return inventoryDto(context.inventory);
      },
    );
    scoped.get<{ Params: OperationParams }>(
      '/v1/inventories/:inventoryId/operations/:operationId',
      {
        schema: {
          querystring: noQuerySchema,
          params: operationParamsSchema,
          response: { 200: operationReceiptSchema },
        },
      },
      async (request) => {
        const authenticated = await authorizeBusinessRequest(auth, request);
        const context = await resolveCloudInventory(
          database,
          authenticated,
          request.params.inventoryId,
        );
        const receipt = await findOperationReceipt(
          database,
          {
            businessId: context.business.id,
            inventoryId: context.inventory.id,
          },
          request.params.operationId,
          request.id,
        );
        if (!receipt)
          throw new OwnershipError(
            404,
            'NOT_FOUND',
            'No encontramos esta operación.',
          );
        return receipt.result;
      },
    );
  });
}
