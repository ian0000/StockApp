import type {
  VoidSaleCommandResult,
  VoidPurchaseCommandResult,
  InventoryStateDto,
} from '@stock-app/contracts';
import { ApiClientError, type createApiClient } from '../api/client.js';
import { requestCsrf } from '../api/csrf.js';
import { createSalesClient } from '../sales/client.js';
import { createPurchasesClient } from '../purchases/client.js';
import { createProductsClient } from '../products/client.js';
import type { AcceptedReceipt } from '../commands/controller.js';
import {
  operation,
  productIds,
  type VoidCommand,
  type VoidReview,
  type VoidKind,
  type VoidDetail,
} from './input.js';
import validateState from '../api/generated/inventory-state.mjs';
import validateSaleCommand from '../api/generated/void-sale-command.mjs';
import validatePurchaseCommand from '../api/generated/void-purchase-command.mjs';
import validateSaleResult from '../api/generated/void-sale-result.mjs';
import validatePurchaseResult from '../api/generated/void-purchase-result.mjs';
export type VoidResult = VoidSaleCommandResult | VoidPurchaseCommandResult;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
export const resultId = (r: VoidResult) =>
  'sale' in r ? r.sale.id : r.purchase.id;
const prefix = (id: string) => `/v1/inventories/${encodeURIComponent(id)}`;

export function coherentVoid(
  r: VoidResult,
  inventoryId: string,
  command?: VoidCommand,
  review?: VoidReview,
) {
  const sale = 'sale' in r,
    original = sale ? r.sale : r.purchase,
    count = r.states.length;
  if (
    r.kind !== 'VOIDED' ||
    original.status !== 'VOIDED' ||
    !same(original.inventoryId, inventoryId) ||
    !count ||
    r.reversals.length !== count ||
    (!sale && count !== 1) ||
    new Set(r.states.map((s) => s.productId.toLowerCase())).size !== count ||
    new Set(r.reversals.map((m) => m.productId.toLowerCase())).size !== count ||
    new Set(r.reversals.map((m) => m.id.toLowerCase())).size !== count ||
    new Set(r.reversals.map((m) => m.reversalOfMovementId?.toLowerCase()))
      .size !== count
  )
    return false;
  if (review) {
    const before = operation(review);
    const snapshot = (value: object) =>
      Object.entries(value)
        .filter(([key]) => key !== 'status' && key !== 'updatedAt')
        .sort(([a], [b]) => a.localeCompare(b));
    if (
      JSON.stringify(snapshot(before)) !== JSON.stringify(snapshot(original)) ||
      original.updatedAt < before.updatedAt ||
      productIds(review).length !== count
    )
      return false;
  }
  if (
    command &&
    (sale !== (command.commandKind === 'SALE_VOID') ||
      !same(
        original.id,
        command.commandKind === 'SALE_VOID'
          ? command.payload.saleId
          : command.payload.purchaseId,
      ))
  )
    return false;
  for (const state of r.states) {
    const m = r.reversals.find((m) => same(m.productId, state.productId));
    if (
      !m ||
      !same(state.inventoryId, inventoryId) ||
      !same(m.inventoryId, inventoryId) ||
      m.type !== 'REVERSAL' ||
      m.sourceType !== 'INVENTORY_MOVEMENT' ||
      !m.sourceId ||
      !m.reversalOfMovementId ||
      !same(m.sourceId, m.reversalOfMovementId) ||
      same(m.id, m.reversalOfMovementId) ||
      m.metadata !== null ||
      !state.lastMovementId ||
      !same(state.lastMovementId, m.id) ||
      state.stock !== m.stockAfter ||
      !Number.isSafeInteger(m.stockBefore + m.quantityDelta) ||
      m.stockBefore + m.quantityDelta !== m.stockAfter ||
      m.updatedAt !== m.createdAt ||
      (sale && (m.quantityDelta <= 0 || state.unitCost !== m.unitCostSnapshot))
    )
      return false;
    if (
      !sale &&
      (!same(state.productId, r.purchase.productId) ||
        m.quantityDelta !== -r.purchase.quantity ||
        m.stockBefore !== r.purchase.stockAfter ||
        m.stockAfter !== r.purchase.stockBefore ||
        m.unitCostSnapshot !== r.purchase.unitCost ||
        state.unitCost !== r.purchase.averageCostBefore)
    )
      return false;
    if (review && review.commandKind === 'SALE_VOID') {
      const item = review.detail.items.find((i) =>
        same(i.productId, state.productId),
      );
      if (
        !item ||
        item.quantity !== m.quantityDelta ||
        item.unitCostSnapshot !== m.unitCostSnapshot
      )
        return false;
    }
    if (command) {
      const evidence =
        command.commandKind === 'SALE_VOID'
          ? command.preconditions.states.find((s) =>
              same(s.productId, state.productId),
            )
          : command.preconditions;
      const id =
        command.commandKind === 'SALE_VOID'
          ? command.payload.reversalMovements.find((s) =>
              same(s.productId, state.productId),
            )?.movementId
          : command.payload.reversalMovementId;
      if (
        !evidence ||
        !id ||
        !same(m.id, id) ||
        typeof evidence.expectedStateRevision !== 'string' ||
        BigInt(state.stateRevision) !==
          BigInt(evidence.expectedStateRevision) + 1n ||
        m.stockBefore !== evidence.expectedState.stock ||
        (sale && m.unitCostSnapshot !== evidence.expectedState.unitCost) ||
        m.createdAt !== command.payload.createdAt ||
        m.effectiveAt !== command.occurredAt
      )
        return false;
    }
  }
  return true;
}
export function recoverVoid(
  receipt: AcceptedReceipt,
  inventoryId: string,
  kind: VoidKind,
  command?: VoidCommand,
  review?: VoidReview,
): VoidResult {
  const c = receipt.changeSet,
    u = c.upserts;
  if (
    !same(c.inventoryId, inventoryId) ||
    (command && !same(receipt.operationId, command.operationId)) ||
    u.products.length ||
    u.saleItems.length ||
    u.stockAdjustments.length ||
    c.tombstones.length ||
    (kind === 'SALE_VOID'
      ? u.sales.length !== 1 || u.purchases.length !== 0
      : u.purchases.length !== 1 || u.sales.length !== 0)
  )
    throw new ApiClientError('INVALID_JSON', 200);
  const base = {
    kind: 'VOIDED' as const,
    reversals: u.inventoryMovements,
    states: u.inventoryStates,
    committedRevision: c.revision,
    serverRecordedAt: c.serverRecordedAt,
  };
  const result =
    kind === 'SALE_VOID'
      ? { ...base, sale: u.sales[0] }
      : { ...base, purchase: u.purchases[0] };
  if (
    kind === 'SALE_VOID'
      ? validateSaleResult(result)
      : validatePurchaseResult(result)
  ) {
    // Both validators narrow the same public union; no private receipt references are needed.
    if (
      (validateSaleResult(result) || validatePurchaseResult(result)) &&
      coherentVoid(result, inventoryId, command, review)
    )
      return result;
  }
  throw new ApiClientError('INVALID_JSON', 200);
}
export function createVoidsClient(api: ReturnType<typeof createApiClient>) {
  const sales = createSalesClient(api),
    purchases = createPurchasesClient(api),
    products = createProductsClient(api);
  return {
    async detail(
      inventoryId: string,
      kind: VoidKind,
      id: string,
      signal: AbortSignal,
    ): Promise<VoidDetail | null> {
      if (kind === 'SALE_VOID') {
        const detail = await sales.detail(inventoryId, id, signal);
        return detail ? { commandKind: kind, detail } : null;
      }
      const detail = await purchases.detail(inventoryId, id, signal);
      return detail ? { commandKind: kind, detail } : null;
    },
    async state(
      inventoryId: string,
      productId: string,
      signal: AbortSignal,
    ): Promise<InventoryStateDto> {
      const r = await api.request(
        `${prefix(inventoryId)}/products/${encodeURIComponent(productId)}/state`,
        { signal },
      );
      if (
        r.status !== 200 ||
        !validateState(r.body) ||
        !same(r.body.inventoryId, inventoryId) ||
        !same(r.body.productId, productId)
      )
        throw new ApiClientError('INVALID_JSON', r.status);
      return r.body;
    },
    receipt: products.receipt,
    async send(
      inventoryId: string,
      command: VoidCommand,
      review: VoidReview | undefined,
      signal: AbortSignal,
      beforeSend: () => void,
    ): Promise<VoidResult> {
      if (
        command.commandKind === 'SALE_VOID'
          ? !validateSaleCommand(command) ||
            command.preconditions.states.some(
              (s) => typeof s.expectedStateRevision !== 'string',
            )
          : !validatePurchaseCommand(command) ||
            typeof command.preconditions.expectedStateRevision !== 'string'
      )
        throw new ApiClientError('INVALID_JSON', null);
      const sale = command.commandKind === 'SALE_VOID',
        token = await requestCsrf(api, signal);
      beforeSend();
      const r = await api.request(
        `${prefix(inventoryId)}/${sale ? 'sales' : 'purchases'}/${encodeURIComponent(sale ? command.payload.saleId : command.payload.purchaseId)}/void`,
        {
          method: 'POST',
          body: command,
          signal,
          headers: {
            'X-CSRF-Token': token,
            'Idempotency-Key': command.operationId,
          },
        },
      );
      if (
        r.status === 200 &&
        (sale ? validateSaleResult(r.body) : validatePurchaseResult(r.body)) &&
        (validateSaleResult(r.body) || validatePurchaseResult(r.body)) &&
        coherentVoid(r.body, inventoryId, command, review)
      )
        return r.body;
      throw new ApiClientError('INVALID_JSON', r.status);
    },
  };
}
export type VoidsClient = ReturnType<typeof createVoidsClient>;
