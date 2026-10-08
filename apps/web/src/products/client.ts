import type {
  CreateProductCommand,
  ProductPage,
  ProductReadDto,
  UpdateProductCommand,
  ArchiveProductCommand,
} from '@stock-app/contracts';
import { ApiClientError, type createApiClient } from '../api/client.js';
import { requestCsrf } from '../api/csrf.js';
import validatePage from '../api/generated/product-page.mjs';
import validateProduct from '../api/generated/product-read.mjs';
import validateCommand from '../api/generated/create-product-command.mjs';
import validateResult from '../api/generated/create-product-result.mjs';
import validateReceipt from '../api/generated/operation-receipt.mjs';
import validateUpdate from '../api/generated/update-product-command.mjs';
import validateArchive from '../api/generated/archive-product-command.mjs';
import validateMutation from '../api/generated/product-mutation-result.mjs';

const prefix = (inventoryId: string) =>
  `/v1/inventories/${encodeURIComponent(inventoryId)}`;
function ownProduct(product: ProductReadDto, inventoryId: string) {
  return (
    product.product.inventoryId.toLowerCase() === inventoryId.toLowerCase() &&
    product.state.inventoryId.toLowerCase() === inventoryId.toLowerCase() &&
    product.state.productId.toLowerCase() ===
      product.product.id.toLowerCase() &&
    !product.product.isArchived
  );
}
export function createProductsClient(api: ReturnType<typeof createApiClient>) {
  return {
    async detail(inventoryId: string, productId: string, signal: AbortSignal) {
      try {
        const response = await api.request(
          `${prefix(inventoryId)}/products/${encodeURIComponent(productId)}`,
          { signal },
        );
        if (
          response.status !== 200 ||
          !validateProduct(response.body) ||
          !ownProduct(response.body, inventoryId) ||
          response.body.product.id.toLowerCase() !== productId.toLowerCase()
        )
          throw new ApiClientError('INVALID_JSON', response.status);
        return response.body;
      } catch (error) {
        if (
          error instanceof ApiClientError &&
          error.status === 404 &&
          error.apiError?.error.code === 'NOT_FOUND'
        )
          return null;
        throw error;
      }
    },
    async mutate(
      inventoryId: string,
      command: UpdateProductCommand | ArchiveProductCommand,
      signal: AbortSignal,
      beforeSend: () => void,
    ) {
      if (
        !(command.commandKind === 'PRODUCT_UPDATE'
          ? validateUpdate(command)
          : validateArchive(command))
      )
        throw new ApiClientError('INVALID_JSON', null);
      const token = await requestCsrf(api, signal);
      beforeSend();
      const archive = command.commandKind === 'PRODUCT_ARCHIVE';
      const response = await api.request(
        `${prefix(inventoryId)}/products/${encodeURIComponent(command.payload.productId)}${archive ? '/archive' : ''}`,
        {
          method: archive ? 'POST' : 'PATCH',
          body: command,
          headers: {
            'X-CSRF-Token': token,
            'Idempotency-Key': command.operationId,
          },
          signal,
        },
      );
      if (
        response.status !== 200 ||
        !validateMutation(response.body) ||
        response.body.product.id.toLowerCase() !==
          command.payload.productId.toLowerCase() ||
        response.body.product.inventoryId.toLowerCase() !==
          inventoryId.toLowerCase() ||
        response.body.product.isArchived !== archive
      )
        throw new ApiClientError('INVALID_JSON', response.status);
      return response.body;
    },
    async page(
      inventoryId: string,
      search: string,
      cursor: string | null,
      signal: AbortSignal,
    ) {
      const query = new URLSearchParams();
      if (search) query.set('search', search);
      if (cursor !== null) query.set('cursor', cursor);
      const response = await api.request(
        `${prefix(inventoryId)}/products${query.size ? `?${query}` : ''}`,
        { signal },
      );
      if (
        response.status !== 200 ||
        !validatePage(response.body) ||
        !response.body.items.every((item) => ownProduct(item, inventoryId))
      )
        throw new ApiClientError('INVALID_JSON', response.status);
      return response.body;
    },
    async barcode(inventoryId: string, code: string, signal: AbortSignal) {
      const value = code.trim();
      if (!value) throw new TypeError('Escribe un código de barras.');
      try {
        const response = await api.request(
          `${prefix(inventoryId)}/products/by-barcode?${new URLSearchParams({ code: value })}`,
          { signal },
        );
        if (
          response.status !== 200 ||
          !validateProduct(response.body) ||
          !ownProduct(response.body, inventoryId)
        )
          throw new ApiClientError('INVALID_JSON', response.status);
        return response.body;
      } catch (error) {
        if (
          error instanceof ApiClientError &&
          error.status === 404 &&
          error.apiError?.error.code === 'NOT_FOUND'
        )
          return null;
        throw error;
      }
    },
    async create(
      inventoryId: string,
      command: CreateProductCommand,
      signal: AbortSignal,
      beforeSend: () => void,
    ) {
      if (!validateCommand(command))
        throw new ApiClientError('INVALID_JSON', null);
      const token = await requestCsrf(api, signal);
      beforeSend();
      const response = await api.request(`${prefix(inventoryId)}/products`, {
        method: 'POST',
        body: command,
        headers: {
          'X-CSRF-Token': token,
          'Idempotency-Key': command.operationId,
        },
        signal,
      });
      if (
        response.status !== 200 ||
        !validateResult(response.body) ||
        response.body.product.id.toLowerCase() !==
          command.payload.productId.toLowerCase() ||
        response.body.product.inventoryId.toLowerCase() !==
          inventoryId.toLowerCase() ||
        response.body.state.inventoryId.toLowerCase() !==
          inventoryId.toLowerCase() ||
        response.body.state.productId.toLowerCase() !==
          command.payload.productId.toLowerCase()
      )
        throw new ApiClientError('INVALID_JSON', response.status);
      return response.body;
    },
    async receipt(
      inventoryId: string,
      operationId: string,
      signal: AbortSignal,
    ) {
      try {
        const response = await api.request(
          `${prefix(inventoryId)}/operations/${encodeURIComponent(operationId)}`,
          { signal },
        );
        if (
          response.status !== 200 ||
          !validateReceipt(response.body) ||
          response.body.operationId.toLowerCase() !==
            operationId.toLowerCase() ||
          (response.body.status === 'ACCEPTED' &&
            response.body.changeSet.inventoryId.toLowerCase() !==
              inventoryId.toLowerCase())
        )
          throw new ApiClientError('INVALID_JSON', response.status);
        return response.body;
      } catch (error) {
        if (
          error instanceof ApiClientError &&
          error.status === 404 &&
          error.apiError?.error.code === 'NOT_FOUND'
        )
          return null;
        throw error;
      }
    },
  };
}
export type ProductsClient = ReturnType<typeof createProductsClient>;
export function uniqueProducts(pages: readonly ProductPage[]) {
  const seen = new Set<string>();
  return pages.flatMap((page) =>
    page.items.filter((item) => {
      const id = item.product.id.toLowerCase();
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    }),
  );
}
