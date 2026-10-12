import type {
  InventoryMovementDto,
  OperationReceipt,
  VoidSaleCommandResult,
  VoidPurchaseCommandResult,
} from '@stock-app/contracts';
import { v7 } from 'uuid';
import { fixture } from './session-fixtures.js';
import { inventoryId, memoryStorage } from './product-fixtures.js';
import { createApiClient } from '../src/api/client.js';
import { createVoidsClient, type VoidResult } from '../src/voids/client.js';
import {
  VoidController,
  PENDING_SALE_VOID_KEY,
  PENDING_PURCHASE_VOID_KEY,
} from '../src/voids/controller.js';
import {
  operation,
  type VoidCommand,
  type VoidKind,
  type VoidReview,
} from '../src/voids/input.js';
export const legacyOperationId = '550e8400-e29b-41d4-a716-446655440111';
export const legacyProductId = '550e8400-e29b-41d4-a716-446655440112';
export function voidReview(
  kind: VoidKind,
  cost: string | null = '1000000',
  multiple = false,
): VoidReview {
  const products = [
    legacyProductId,
    ...(multiple ? ['550e8400-e29b-41d4-a716-446655440113'] : []),
  ];
  const states = products.map((productId) => ({
    inventoryId,
    productId,
    stock: -3,
    unitCost: cost,
    stateRevision: '9007199254740993',
    lastMovementId: v7(),
  }));
  const base = {
    id: legacyOperationId,
    inventoryId,
    status: 'CONFIRMED' as const,
    notes: null,
    effectiveAt: 10,
    createdAt: 20,
    updatedAt: 20,
  };
  if (kind === 'SALE_VOID')
    return {
      commandKind: kind,
      states,
      detail: {
        sale: {
          ...base,
          totalAmount: String(6000000 * products.length),
          estimatedCost:
            cost === null
              ? null
              : String(BigInt(cost) * 2n * BigInt(products.length)),
          estimatedProfit:
            cost === null
              ? null
              : String(
                  (6000000n - BigInt(cost) * 2n) * BigInt(products.length),
                ),
        },
        items: products.map((productId) => ({
          id: v7(),
          inventoryId,
          saleId: legacyOperationId,
          productId,
          quantity: 2,
          unitSalePrice: '3000000',
          subtotal: '6000000',
          createdAt: 20,
          updatedAt: 20,
          productName: 'Agua',
          productVariant: null,
          ...(cost === null
            ? {
                costStatus: 'UNKNOWN' as const,
                unitCostSnapshot: null,
                estimatedCost: null,
                estimatedProfit: null,
              }
            : {
                costStatus: 'KNOWN' as const,
                unitCostSnapshot: cost,
                estimatedCost: String(BigInt(cost) * 2n),
                estimatedProfit: String(6000000n - BigInt(cost) * 2n),
              }),
        })),
        voidEligibility: { eligible: true, reason: null },
      },
    };
  return {
    commandKind: kind,
    states: [{ ...states[0]!, stock: 7, unitCost: '2000000' }],
    detail: {
      purchase: {
        ...base,
        productId: legacyProductId,
        quantity: 10,
        unitCost: '2000000',
        totalAmount: '20000000',
        stockBefore: -3,
        stockAfter: 7,
        averageCostBefore: cost,
        averageCostAfter: '2000000',
      },
      voidEligibility: { eligible: true, reason: null },
    },
  };
}
export function voidResult(
  command: VoidCommand,
  review: VoidReview,
): VoidResult {
  const reversals: InventoryMovementDto[] = review.states.map((state) => {
    const sale = command.commandKind === 'SALE_VOID';
    const quantity =
      review.commandKind === 'SALE_VOID'
        ? review.detail.items.find((i) => i.productId === state.productId)!
            .quantity
        : -review.detail.purchase.quantity;
    return {
      id: sale
        ? command.payload.reversalMovements.find(
            (i) => i.productId === state.productId,
          )!.movementId
        : command.payload.reversalMovementId,
      inventoryId,
      productId: state.productId,
      type: 'REVERSAL',
      quantityDelta: quantity,
      stockBefore: state.stock,
      stockAfter: state.stock + quantity,
      unitCostSnapshot: state.unitCost,
      sourceType: 'INVENTORY_MOVEMENT',
      sourceId: state.lastMovementId,
      reversalOfMovementId: state.lastMovementId,
      metadata: null,
      effectiveAt: command.occurredAt,
      createdAt: command.payload.createdAt,
      updatedAt: command.payload.createdAt,
    };
  });
  const states = review.states.map((s, i) => ({
    ...s,
    stock: reversals[i]!.stockAfter,
    unitCost:
      review.commandKind === 'PURCHASE_VOID'
        ? review.detail.purchase.averageCostBefore
        : s.unitCost,
    stateRevision: String(BigInt(s.stateRevision) + 1n),
    lastMovementId: reversals[i]!.id,
  }));
  const base = {
    kind: 'VOIDED' as const,
    reversals,
    states,
    committedRevision: '2',
    serverRecordedAt: command.occurredAt,
  };
  return review.commandKind === 'SALE_VOID'
    ? ({
        ...base,
        sale: {
          ...review.detail.sale,
          status: 'VOIDED',
          updatedAt: command.occurredAt,
        },
      } satisfies VoidSaleCommandResult)
    : ({
        ...base,
        purchase: {
          ...review.detail.purchase,
          status: 'VOIDED',
          updatedAt: command.occurredAt,
        },
      } satisfies VoidPurchaseCommandResult);
}
export function voidReceipt(
  command: VoidCommand,
  review: VoidReview,
): Extract<OperationReceipt, { status: 'ACCEPTED' }> {
  const r = voidResult(command, review);
  return {
    operationId: command.operationId,
    status: 'ACCEPTED',
    changeSet: {
      inventoryId,
      revision: r.committedRevision,
      serverRecordedAt: r.serverRecordedAt,
      tombstones: [],
      upserts: {
        products: [],
        sales: 'sale' in r ? [r.sale] : [],
        purchases: 'purchase' in r ? [r.purchase] : [],
        saleItems: [],
        stockAdjustments: [],
        inventoryStates: r.states,
        inventoryMovements: r.reversals,
      },
    },
  };
}
export function voidFixture(
  kind: VoidKind,
  fetcher: typeof fetch,
  stored?: { operationId: string; inventoryId: string; commandKind: VoidKind },
) {
  const f = fixture(),
    memory = memoryStorage(),
    client = createVoidsClient(
      createApiClient({ baseUrl: 'https://api.example.test', fetcher }),
    );
  const key =
    kind === 'SALE_VOID' ? PENDING_SALE_VOID_KEY : PENDING_PURCHASE_VOID_KEY;
  if (stored) memory.values.set(key, JSON.stringify(stored));
  let online = true;
  const voids = new VoidController(
    kind,
    client,
    f.controller,
    f.queries,
    memory.storage,
    () => online,
  );
  return {
    ...f,
    ...memory,
    voids,
    client,
    key,
    setOnline: (value: boolean) => {
      online = value;
    },
    dispose() {
      voids.dispose();
      f.controller.dispose();
      f.queries.clear();
    },
  };
}
export async function settledVoid(controller: VoidController) {
  if (
    !['CHECKING', 'PREPARING', 'SENDING'].includes(controller.snapshot().kind)
  )
    return;
  await new Promise<void>((resolve) => {
    const stop = controller.subscribe(() => {
      if (
        !['CHECKING', 'PREPARING', 'SENDING'].includes(
          controller.snapshot().kind,
        )
      ) {
        stop();
        resolve();
      }
    });
  });
}
export { operation };
