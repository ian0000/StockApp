import type { FastifyInstance } from 'fastify';
import {
  contractSchemas,
  createSchemaValidator,
  createApiError,
  type ProductQuery,
  type HistoryQuery,
} from '@stock-app/contracts';
import type { StockAppAuth } from '../auth/create-auth.js';
import {
  resolveCloudInventory,
  type OwnershipDatabase,
} from '../ownership/context.js';
import { OwnershipError } from '../ownership/errors.js';
import { authorizeBusinessRequest } from '../security/business.js';
import { CommandError } from '../commands/errors.js';
import { createReadCursor } from './cursor.js';
import { readProduct, readProductPage, type ReadDatabase } from './products.js';
import { readSaleDetail, readPurchaseDetail } from './details.js';
import { readHistory } from './history.js';
import { readDashboard } from './dashboard.js';

export function registerReadRoutes(
  app: FastifyInstance,
  auth: StockAppAuth,
  database: OwnershipDatabase,
  cursorSecret: string,
  clock: () => number = Date.now,
): void {
  const codec = createReadCursor(cursorSecret);
  app.register(async (scoped) => {
    const foundation = scoped.errorHandler;
    scoped.setErrorHandler(function (error, request, reply) {
      if (error instanceof OwnershipError)
        return reply
          .code(error.statusCode)
          .send(createApiError(error.code, error.message, request.id));
      return foundation.call(this, error, request, reply);
    });
    async function read<T>(handler: (db: ReadDatabase) => Promise<T>) {
      // A request observes one coherent view; pagination across separate requests remains live.
      return database.transaction(handler, {
        isolationLevel: 'repeatable read',
        accessMode: 'read only',
      });
    }
    const prefix = '/v1/inventories/:inventoryId';
    for (const entry of [
      {
        suffix: '/products',
        response: 'ProductPage',
        params: 'InventoryParams',
        query: 'ProductQuery',
      },
      {
        suffix: '/stock-low',
        response: 'ProductPage',
        params: 'InventoryParams',
        query: 'PaginationQuery',
      },
      {
        suffix: '/products/by-barcode',
        response: 'ProductRead',
        params: 'InventoryParams',
        query: 'BarcodeQuery',
      },
      {
        suffix: '/products/:productId',
        response: 'ProductRead',
        params: 'ProductParams',
        query: 'NoQuery',
      },
      {
        suffix: '/sales/:saleId',
        response: 'SaleDetail',
        params: 'SaleParams',
        query: 'NoQuery',
      },
      {
        suffix: '/purchases/:purchaseId',
        response: 'PurchaseDetail',
        params: 'PurchaseParams',
        query: 'NoQuery',
      },
      {
        suffix: '/history',
        response: 'HistoryPage',
        params: 'InventoryParams',
        query: 'HistoryQuery',
      },
      {
        suffix: '/dashboard',
        response: 'Dashboard',
        params: 'InventoryParams',
        query: 'NoQuery',
      },
    ] as const) {
      const validate = createSchemaValidator(contractSchemas[entry.response]);
      scoped.get<{
        Params: {
          inventoryId: string;
          productId?: string;
          saleId?: string;
          purchaseId?: string;
        };
        Querystring: ProductQuery & HistoryQuery & { code?: string };
      }>(
        prefix + entry.suffix,
        {
          preValidation: async (request) => {
            if (
              entry.query === 'ProductQuery' ||
              entry.query === 'PaginationQuery' ||
              entry.query === 'HistoryQuery'
            ) {
              const value: unknown = request.query.limit;
              if (typeof value === 'string') {
                if (!/^[1-9][0-9]{0,2}$/.test(value))
                  throw new CommandError(400, 'VALIDATION_ERROR');
                request.query.limit = Number(value);
              }
            }
          },
          schema: {
            params: contractSchemas[entry.params],
            querystring: contractSchemas[entry.query],
            response: { 200: contractSchemas[entry.response] },
          },
        },
        async (request) => {
          const authenticated = await authorizeBusinessRequest(auth, request),
            context = await resolveCloudInventory(
              database,
              authenticated,
              request.params.inventoryId,
            ),
            inventoryId = context.inventory.id,
            query = request.query;
          const value = await read(async (db) => {
            if (entry.suffix === '/products' || entry.suffix === '/stock-low')
              return readProductPage(
                db,
                {
                  inventoryId,
                  route:
                    entry.suffix === '/products' ? 'products' : 'stock-low',
                  search:
                    entry.suffix === '/products'
                      ? (query.search?.trim() ?? '')
                      : '',
                },
                query.limit ?? 50,
                query.cursor,
                codec,
                entry.suffix === '/stock-low',
              );
            if (entry.suffix === '/products/by-barcode')
              return readProduct(db, inventoryId, { barcode: query.code! });
            if (entry.suffix === '/products/:productId')
              return readProduct(db, inventoryId, {
                id: request.params.productId!,
              });
            if (entry.suffix === '/sales/:saleId')
              return readSaleDetail(db, inventoryId, request.params.saleId!);
            if (entry.suffix === '/purchases/:purchaseId')
              return readPurchaseDetail(
                db,
                inventoryId,
                request.params.purchaseId!,
              );
            if (entry.suffix === '/history')
              return readHistory(
                db,
                { inventoryId, route: 'history', search: '' },
                query.limit ?? 50,
                query.cursor,
                codec,
              );
            return readDashboard(
              db,
              inventoryId,
              context.inventory.reportingTimeZone,
              clock(),
              codec,
            );
          });
          if (value === null)
            throw new OwnershipError(
              404,
              'NOT_FOUND',
              'No encontramos el recurso solicitado.',
            );
          validate(value);
          return value;
        },
      );
    }
  });
}
