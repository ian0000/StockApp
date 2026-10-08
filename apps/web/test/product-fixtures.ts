import type {
  CreateProductCommand,
  CreateProductCommandResult,
  OperationReceipt,
  ProductReadDto,
} from '@stock-app/contracts';
import { fixture, me } from './session-fixtures.js';
import { createApiClient } from '../src/api/client.js';
import { createProductsClient } from '../src/products/client.js';
import { ProductsController } from '../src/products/controller.js';
import {
  PENDING_PRODUCT_KEY,
  type PendingStorage,
} from '../src/products/pending.js';

export const inventoryId = me.inventory!.id;
export const productId = '019e3000-0000-7000-8000-000000000003';
export const operationId = '019e3000-0000-7000-8000-000000000004';
export const product: ProductReadDto = {
  product: {
    id: productId,
    inventoryId,
    name: 'Agua',
    variant: '1 L',
    barcode: '0012345',
    regularSalePrice: '1123456',
    minimumStock: 0,
    isArchived: false,
    metadataRevision: '0',
    createdAt: 1,
    updatedAt: 1,
  },
  state: {
    inventoryId,
    productId,
    stock: -2,
    unitCost: null,
    stateRevision: '0',
    lastMovementId: null,
  },
  isLowStock: true,
  margin: null,
  markup: null,
};
export function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}
export function failure(status: number, code = 'NOT_FOUND') {
  return json(
    { error: { code, message: 'Public message', requestId: 'request-test' } },
    status,
  );
}
// Build the strict entity shape; a command payload is never a Product DTO.
export function strictResult(
  command: CreateProductCommand,
): CreateProductCommandResult {
  const payload = command.payload;
  return {
    product: {
      ...product.product,
      id: payload.productId,
      name: payload.name,
      variant: payload.variant,
      barcode: payload.barcode,
      regularSalePrice: payload.regularSalePrice,
      minimumStock: payload.minimumStock,
      createdAt: payload.createdAt,
      updatedAt: payload.createdAt,
    },
    state: { ...product.state, productId: payload.productId, stock: 0 },
    initialMovement: null,
    committedRevision: '1',
    serverRecordedAt: command.occurredAt,
  };
}
export function receipt(status: OperationReceipt['status']): OperationReceipt {
  if (status !== 'ACCEPTED')
    return {
      operationId,
      status,
      error: { code: 'DOMAIN_RULE', message: 'Public error', requestId: 'r' },
    };
  return {
    operationId,
    status,
    changeSet: {
      inventoryId,
      revision: '1',
      serverRecordedAt: 1,
      upserts: {
        products: [product.product],
        inventoryStates: [product.state],
        sales: [],
        saleItems: [],
        purchases: [],
        stockAdjustments: [],
        inventoryMovements: [],
      },
      tombstones: [],
    },
  };
}
export function memoryStorage(value?: string) {
  const values = new Map<string, string>(
    value ? [[PENDING_PRODUCT_KEY, value]] : [],
  );
  const storage: PendingStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, text) => {
      values.set(key, text);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
  return { values, storage };
}
export function descriptor(id = inventoryId) {
  return JSON.stringify({
    operationId,
    inventoryId: id,
    commandKind: 'PRODUCT_CREATE',
  });
}
export function productsFixture(
  fetcher: typeof fetch = async () => json({ items: [], nextCursor: null }),
  stored?: string,
) {
  const session = fixture(),
    memory = memoryStorage(stored);
  const client = createProductsClient(
    createApiClient({ baseUrl: 'https://api.example.test', fetcher }),
  );
  const products = new ProductsController(
    client,
    session.controller,
    session.queries,
    memory.storage,
    () => true,
  );
  return {
    ...session,
    ...memory,
    client,
    products,
    dispose() {
      products.dispose();
      session.controller.dispose();
      session.queries.clear();
    },
  };
}
export async function settled(products: ProductsController) {
  if (!['CHECKING', 'SENDING'].includes(products.snapshot().kind)) return;
  await new Promise<void>((resolve) => {
    const stop = products.subscribe(() => {
      if (!['CHECKING', 'SENDING'].includes(products.snapshot().kind)) {
        stop();
        resolve();
      }
    });
  });
}
