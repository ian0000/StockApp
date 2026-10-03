import type { FastifyInstance } from 'fastify';
import { createApiError } from '@stock-app/contracts';
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

const noQuery = {
  type: 'object',
  properties: {},
  additionalProperties: false,
} as const;
const bootstrapSchema = {
  type: 'object',
  properties: {
    inventoryName: { type: 'string', minLength: 1, maxLength: 200 },
    currency: { type: 'string', pattern: '^[A-Z]{3}$' },
    reportingTimeZone: { type: 'string', minLength: 1, maxLength: 100 },
  },
  required: ['inventoryName', 'currency', 'reportingTimeZone'],
  additionalProperties: false,
} as const;
const inventorySchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    currency: { type: 'string' },
    reportingTimeZone: { type: 'string' },
  },
  required: ['id', 'name', 'currency', 'reportingTimeZone'],
  additionalProperties: false,
} as const;
const businessSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    status: { type: 'string', enum: ['ACTIVE', 'DELETING'] },
    cloudAccessEnabled: { type: 'boolean' },
  },
  required: ['id', 'status', 'cloudAccessEnabled'],
  additionalProperties: false,
} as const;

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
          querystring: noQuery,
          response: {
            200: {
              type: 'object',
              properties: { token: { type: 'string' } },
              required: ['token'],
              additionalProperties: false,
            },
          },
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
          querystring: noQuery,
          response: {
            200: {
              type: 'object',
              properties: {
                user: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    email: { type: 'string' },
                    emailVerified: { type: 'boolean' },
                  },
                  required: ['id', 'email', 'emailVerified'],
                  additionalProperties: false,
                },
                business: { anyOf: [businessSchema, { type: 'null' }] },
                inventory: { anyOf: [inventorySchema, { type: 'null' }] },
              },
              required: ['user', 'business', 'inventory'],
              additionalProperties: false,
            },
          },
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
        };
      },
    );
    scoped.post<{ Body: BootstrapInput }>(
      '/v1/business',
      {
        bodyLimit: 32 * 1024,
        schema: {
          body: bootstrapSchema,
          querystring: noQuery,
          response: {
            200: {
              type: 'object',
              properties: {
                business: businessSchema,
                inventory: inventorySchema,
              },
              required: ['business', 'inventory'],
              additionalProperties: false,
            },
            201: {
              type: 'object',
              properties: {
                business: businessSchema,
                inventory: inventorySchema,
              },
              required: ['business', 'inventory'],
              additionalProperties: false,
            },
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
          querystring: noQuery,
          params: {
            type: 'object',
            properties: {
              inventoryId: {
                type: 'string',
                pattern:
                  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
              },
            },
            required: ['inventoryId'],
            additionalProperties: false,
          },
          response: { 200: inventorySchema },
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
  });
}
