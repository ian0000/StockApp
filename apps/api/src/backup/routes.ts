import type { FastifyInstance, FastifyRequest } from 'fastify';
import { CreateBackupUseCase } from '@stock-app/application';
import {
  contractSchemas,
  createSchemaValidator,
  createApiError,
  type BackupV1Transport,
} from '@stock-app/contracts';
import type { StockAppAuth } from '../auth/create-auth.js';
import {
  resolveAuthenticatedUser,
  resolveOwnDataset,
  resolveCloudInventory,
  type OwnershipDatabase,
} from '../ownership/context.js';
import { OwnershipError } from '../ownership/errors.js';
import { authorizeBusinessRequest } from '../security/business.js';
import { createPostgresBackupReader } from './snapshot.js';
import { requireRecentAuthentication } from './recent-auth.js';

const validateBackup = createSchemaValidator(contractSchemas.BackupV1);
const validateAccount = createSchemaValidator(contractSchemas.AccountExport);
function checkedBackup(value: unknown): asserts value is BackupV1Transport {
  validateBackup(value);
}
function active(status: string | undefined): void {
  if (status !== undefined && status !== 'ACTIVE')
    throw new OwnershipError(
      403,
      'CLOUD_ACCESS_DISABLED',
      'El acceso cloud no está habilitado.',
    );
}
export function registerBackupRoutes(
  app: FastifyInstance,
  auth: StockAppAuth,
  database: OwnershipDatabase,
  clock: () => number = Date.now,
  readerFactory: typeof createPostgresBackupReader = createPostgresBackupReader,
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
    async function authorize(request: FastifyRequest) {
      const authenticated = await authorizeBusinessRequest(auth, request);
      requireRecentAuthentication(authenticated, clock());
      return authenticated;
    }
    async function artifact(
      userId: string,
      inventoryId: string,
      cloud: boolean,
    ) {
      const result = await new CreateBackupUseCase({
        reader: readerFactory(database, userId, cloud),
        clock: { now: clock },
      }).execute({ inventoryId });
      const backup: unknown = JSON.parse(result.contents);
      checkedBackup(backup);
      return { result, backup };
    }
    async function revalidate(request: FastifyRequest, userId: string) {
      // A repeatable-read recheck cannot see revocation/lifecycle changes committed during export.
      // Read current authorization separately before releasing any response bytes; don't consume rate twice.
      const latest = await resolveAuthenticatedUser(auth, request.headers);
      requireRecentAuthentication(latest, clock());
      if (latest.user.id !== userId)
        throw new OwnershipError(
          404,
          'NOT_FOUND',
          'No encontramos este inventario.',
        );
      return latest;
    }
    scoped.get<{ Params: { inventoryId: string } }>(
      '/v1/inventories/:inventoryId/backup',
      {
        schema: {
          params: contractSchemas.InventoryParams,
          querystring: contractSchemas.NoQuery,
          response: { 200: contractSchemas.BackupV1 },
        },
      },
      async (request, reply) => {
        const authenticated = await authorize(request);
        const scope = await resolveCloudInventory(
          database,
          authenticated,
          request.params.inventoryId,
        );
        const { result } = await artifact(
          authenticated.user.id,
          scope.inventory.id,
          true,
        );
        const latest = await revalidate(request, authenticated.user.id);
        await resolveCloudInventory(database, latest, scope.inventory.id);
        return reply
          .type(result.mimeType)
          .header('cache-control', 'private, no-store')
          .header(
            'content-disposition',
            `attachment; filename="${result.fileName}"`,
          )
          .send(result.contents);
      },
    );
    scoped.get(
      '/v1/me/export',
      {
        schema: {
          querystring: contractSchemas.NoQuery,
          response: { 200: contractSchemas.AccountExport },
        },
      },
      async (request, reply) => {
        const authenticated = await authorize(request);
        const scope = await resolveOwnDataset(database, authenticated.user.id);
        active(scope.business?.status);
        const backup = scope.inventory
          ? (await artifact(authenticated.user.id, scope.inventory.id, false))
              .backup
          : null;
        const latest = await revalidate(request, authenticated.user.id);
        const current = await resolveOwnDataset(database, latest.user.id);
        active(current.business?.status);
        if (scope.inventory && current.inventory?.id !== scope.inventory.id)
          throw new OwnershipError(
            404,
            'NOT_FOUND',
            'No encontramos este inventario.',
          );
        const response = {
          user: {
            id: latest.user.id,
            email: latest.user.email,
            emailVerified: latest.user.emailVerified,
          },
          backup,
          exportedAt: clock(),
        };
        validateAccount(response);
        return reply
          .header('cache-control', 'private, no-store')
          .send(response);
      },
    );
  });
}
