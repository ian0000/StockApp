import { v7 } from 'uuid';
import { DOMAIN_VERSION, PROTOCOL_VERSION } from '@stock-app/contracts';
import type {
  InventoryStateDto,
  SaleDetailDto,
  PurchaseDetailDto,
  VoidSaleCommand,
  VoidPurchaseCommand,
} from '@stock-app/contracts';
export type VoidKind = 'SALE_VOID' | 'PURCHASE_VOID';
export type VoidCommand = VoidSaleCommand | VoidPurchaseCommand;
export type VoidDetail =
  | { commandKind: 'SALE_VOID'; detail: SaleDetailDto }
  | { commandKind: 'PURCHASE_VOID'; detail: PurchaseDetailDto };
export type VoidReview = VoidDetail & { states: InventoryStateDto[] };
export const operation = (read: VoidDetail) =>
  read.commandKind === 'SALE_VOID' ? read.detail.sale : read.detail.purchase;
export function productIds(read: VoidDetail) {
  return read.commandKind === 'SALE_VOID'
    ? read.detail.items.map((item) => item.productId)
    : [read.detail.purchase.productId];
}
export function eligibilityMessage(read: VoidDetail) {
  if (operation(read).status === 'VOIDED')
    return read.commandKind === 'SALE_VOID'
      ? 'Venta anulada.'
      : 'Compra anulada.';
  const eligibility = read.detail.voidEligibility;
  if (eligibility.eligible) return '';
  return eligibility.reason === 'SUBSEQUENT_OR_AMBIGUOUS_MOVEMENT'
    ? 'No puedes anular esta operación porque existen movimientos posteriores o su orden no es inequívoco.'
    : eligibility.reason === 'CURRENT_STATE_MISMATCH'
      ? 'No puedes anular esta operación porque el estado actual del inventario no coincide con el resultado de la operación.'
      : 'Esta operación no está disponible para anulación.';
}
export function sameReview(a: VoidReview, b: VoidReview) {
  return JSON.stringify(a) === JSON.stringify(b);
}
export function buildVoid(
  review: VoidReview,
  now = Date.now(),
  uuid = v7,
): VoidCommand {
  const original = operation(review),
    ids = productIds(review).map((id) => id.toLowerCase());
  if (
    original.status !== 'CONFIRMED' ||
    !review.detail.voidEligibility.eligible ||
    !ids.length ||
    new Set(ids).size !== ids.length ||
    review.states.length !== ids.length ||
    new Set(review.states.map((s) => s.productId.toLowerCase())).size !==
      ids.length ||
    review.states.some(
      (s) =>
        !ids.includes(s.productId.toLowerCase()) ||
        s.inventoryId.toLowerCase() !== original.inventoryId.toLowerCase(),
    )
  )
    throw new TypeError('Invalid void evidence.');
  const time = Math.max(now, original.updatedAt);
  const envelope = {
    protocolVersion: PROTOCOL_VERSION,
    domainVersion: DOMAIN_VERSION,
    operationId: uuid(),
    occurredAt: time,
    dependsOn: [],
    deviceId: null,
  };
  const evidence = (s: InventoryStateDto) => ({
    expectedStateRevision: s.stateRevision,
    expectedState: {
      stock: s.stock,
      unitCost: s.unitCost,
      lastMovementId: s.lastMovementId,
    },
  });
  return review.commandKind === 'SALE_VOID'
    ? {
        ...envelope,
        commandKind: 'SALE_VOID',
        payload: {
          saleId: review.detail.sale.id,
          createdAt: time,
          reversalMovements: review.states.map((s) => ({
            productId: s.productId,
            movementId: uuid(),
          })),
        },
        preconditions: {
          states: review.states.map((s) => ({
            productId: s.productId,
            ...evidence(s),
          })),
        },
      }
    : {
        ...envelope,
        commandKind: 'PURCHASE_VOID',
        payload: {
          purchaseId: review.detail.purchase.id,
          createdAt: time,
          reversalMovementId: uuid(),
        },
        preconditions: evidence(review.states[0]!),
      };
}
