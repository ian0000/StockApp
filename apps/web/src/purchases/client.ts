import type {
  RegisterPurchaseCommand,
  RegisterPurchaseCommandResult,
  PurchaseDto,
} from '@stock-app/contracts';
import { Money } from '@stock-app/domain';
import { decodeMoney } from '@stock-app/contracts/transport';
import { ApiClientError, type createApiClient } from '../api/client.js';
import { requestCsrf } from '../api/csrf.js';
import type { AcceptedReceipt } from '../commands/controller.js';
import validateCommand from '../api/generated/register-purchase-command.mjs';
import validateResult from '../api/generated/register-purchase-result.mjs';
import validateDetail from '../api/generated/purchase-detail.mjs';
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const prefix = (id: string) =>
  `/v1/inventories/${encodeURIComponent(id)}/purchases`;
export function validPurchase(p: PurchaseDto, inventoryId: string) {
  if (
    !same(p.inventoryId, inventoryId) ||
    p.stockAfter - p.quantity !== p.stockBefore ||
    !Number.isSafeInteger(p.stockBefore + p.quantity)
  )
    return false;
  try {
    return (
      String(
        Money.fromScaledUnits(decodeMoney(p.unitCost)).multiplyByInteger(
          p.quantity,
        ).scaledUnits,
      ) === p.totalAmount
    );
  } catch {
    return false;
  }
}
function ownResult(
  r: RegisterPurchaseCommandResult,
  id: string,
  command: RegisterPurchaseCommand,
) {
  const {
      purchase: p,
      product,
      beforeState: b,
      afterState: a,
      movement: m,
      priceAnalysis: price,
    } = r,
    expected = command.preconditions.expectedState;
  return (
    validPurchase(p, id) &&
    p.status === 'CONFIRMED' &&
    same(p.id, command.payload.purchaseId) &&
    same(p.productId, command.payload.productId) &&
    p.quantity === command.payload.quantity &&
    p.unitCost === command.payload.unitCost &&
    p.notes === command.payload.notes &&
    p.effectiveAt === command.occurredAt &&
    p.createdAt === command.payload.createdAt &&
    same(product.id, p.productId) &&
    same(product.inventoryId, id) &&
    !product.isArchived &&
    same(b.inventoryId, id) &&
    same(a.inventoryId, id) &&
    same(b.productId, p.productId) &&
    same(a.productId, p.productId) &&
    b.stateRevision === command.preconditions.expectedStateRevision &&
    b.stock === expected.stock &&
    b.unitCost === expected.unitCost &&
    (b.lastMovementId === null
      ? expected.lastMovementId === null
      : expected.lastMovementId !== null &&
        same(b.lastMovementId, expected.lastMovementId)) &&
    a.stock === p.stockAfter &&
    a.unitCost === p.averageCostAfter &&
    b.stock === p.stockBefore &&
    b.unitCost === p.averageCostBefore &&
    BigInt(a.stateRevision) === BigInt(b.stateRevision) + 1n &&
    a.lastMovementId !== null &&
    same(a.lastMovementId, m.id) &&
    same(m.id, command.payload.movementId) &&
    same(m.inventoryId, id) &&
    same(m.productId, p.productId) &&
    m.type === 'PURCHASE' &&
    m.sourceType === 'PURCHASE' &&
    m.sourceId !== null &&
    same(m.sourceId, p.id) &&
    m.quantityDelta === p.quantity &&
    m.stockBefore === p.stockBefore &&
    m.stockAfter === p.stockAfter &&
    m.unitCostSnapshot === p.unitCost &&
    m.reversalOfMovementId === null &&
    price.previousUnitCost === p.averageCostBefore &&
    price.currentUnitCost === p.averageCostAfter &&
    price.regularSalePrice === product.regularSalePrice
  );
}
export function recoverPurchase(
  receipt: AcceptedReceipt,
  inventoryId: string,
  command?: RegisterPurchaseCommand,
) {
  const { changeSet } = receipt,
    up = changeSet.upserts,
    p = up.purchases[0],
    product = up.products[0],
    state = up.inventoryStates[0],
    m = up.inventoryMovements[0];
  if (
    !same(changeSet.inventoryId, inventoryId) ||
    up.purchases.length !== 1 ||
    up.products.length !== 1 ||
    up.inventoryStates.length !== 1 ||
    up.inventoryMovements.length !== 1 ||
    up.sales.length ||
    up.saleItems.length ||
    up.stockAdjustments.length ||
    changeSet.tombstones.length ||
    !p ||
    !product ||
    !state ||
    !m ||
    !validateDetail({
      purchase: p,
      voidEligibility: { eligible: false, reason: null },
    }) ||
    !validPurchase(p, inventoryId) ||
    p.status !== 'CONFIRMED' ||
    !same(product.inventoryId, inventoryId) ||
    !same(product.id, p.productId) ||
    product.isArchived ||
    !same(state.inventoryId, inventoryId) ||
    !same(state.productId, p.productId) ||
    state.stock !== p.stockAfter ||
    state.unitCost !== p.averageCostAfter ||
    state.lastMovementId === null ||
    !same(state.lastMovementId, m.id) ||
    !same(m.inventoryId, inventoryId) ||
    !same(m.productId, p.productId) ||
    m.sourceId === null ||
    !same(m.sourceId, p.id) ||
    m.sourceType !== 'PURCHASE' ||
    m.type !== 'PURCHASE' ||
    m.quantityDelta !== p.quantity ||
    m.stockBefore !== p.stockBefore ||
    m.stockAfter !== p.stockAfter ||
    m.unitCostSnapshot !== p.unitCost ||
    m.reversalOfMovementId !== null ||
    (command &&
      (!same(p.id, command.payload.purchaseId) ||
        !same(p.productId, command.payload.productId) ||
        !same(m.id, command.payload.movementId) ||
        p.quantity !== command.payload.quantity ||
        p.unitCost !== command.payload.unitCost))
  )
    throw new ApiClientError('INVALID_JSON', 200);
  // Receipt has no beforeState/priceAnalysis; recover identity only.
  return p.id;
}
export function createPurchasesClient(api: ReturnType<typeof createApiClient>) {
  return {
    async register(
      inventoryId: string,
      command: RegisterPurchaseCommand,
      signal: AbortSignal,
      beforeSend: () => void,
    ) {
      if (
        !validateCommand(command) ||
        typeof command.preconditions.expectedStateRevision !== 'string'
      )
        throw new ApiClientError('INVALID_JSON', null);
      const token = await requestCsrf(api, signal);
      beforeSend();
      const response = await api.request(prefix(inventoryId), {
        method: 'POST',
        body: command,
        signal,
        headers: {
          'X-CSRF-Token': token,
          'Idempotency-Key': command.operationId,
        },
      });
      if (
        response.status !== 200 ||
        !validateResult(response.body) ||
        !ownResult(response.body, inventoryId, command)
      )
        throw new ApiClientError('INVALID_JSON', response.status);
      return response.body;
    },
    async detail(inventoryId: string, purchaseId: string, signal: AbortSignal) {
      try {
        const response = await api.request(
          `${prefix(inventoryId)}/${encodeURIComponent(purchaseId)}`,
          { signal },
        );
        if (
          response.status !== 200 ||
          !validateDetail(response.body) ||
          !same(response.body.purchase.id, purchaseId) ||
          !validPurchase(response.body.purchase, inventoryId)
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
export type PurchasesClient = ReturnType<typeof createPurchasesClient>;
