import type {
  RegisterPurchaseCommand,
  RegisterPurchaseCommandResult,
  OperationReceipt,
  ProductReadDto,
} from '@stock-app/contracts';
import { Money, applyPurchase } from '@stock-app/domain';
import { createPurchasePriceAnalysis } from '@stock-app/application';
import { decodeMoney } from '@stock-app/contracts/transport';
import {
  product,
  productsFixture,
  inventoryId,
  json,
} from './product-fixtures.js';
import { createApiClient } from '../src/api/client.js';
import { createPurchasesClient } from '../src/purchases/client.js';
import {
  PurchasesController,
  PENDING_PURCHASE_KEY,
} from '../src/purchases/controller.js';
export const purchaseProduct: ProductReadDto = {
  ...product,
  product: { ...product.product, regularSalePrice: '15000000' },
  state: {
    ...product.state,
    stock: 20,
    unitCost: '10000000',
    stateRevision: '9007199254740993',
  },
};
export const purchaseForm = () => ({
  productId: purchaseProduct.product.id,
  quantity: '10',
  unitCost: '12',
});
export const purchaseCsrf = () => json({ token: 'csrf-purchase' });
export function purchaseResult(
  cmd: RegisterPurchaseCommand,
): RegisterPurchaseCommandResult {
  const evidence = cmd.preconditions.expectedState,
    before = {
      stock: evidence.stock,
      unitCost:
        evidence.unitCost === null
          ? null
          : Money.fromScaledUnits(decodeMoney(evidence.unitCost)),
    },
    unitCost = Money.fromScaledUnits(decodeMoney(cmd.payload.unitCost)),
    after = applyPurchase({
      inventory: before,
      quantity: cmd.payload.quantity,
      unitCost,
    }),
    pa = createPurchasePriceAnalysis({
      beforeInventoryState: before,
      afterInventoryState: after,
      regularSalePrice: Money.fromScaledUnits(
        decodeMoney(purchaseProduct.product.regularSalePrice),
      ),
    }),
    time = cmd.payload.createdAt;
  const priceAnalysis = {
    previousUnitCost:
      pa.previousUnitCost === null
        ? null
        : String(pa.previousUnitCost.scaledUnits),
    currentUnitCost: String(pa.currentUnitCost.scaledUnits),
    regularSalePrice: String(pa.regularSalePrice.scaledUnits),
    previousMargin:
      pa.previousMargin === null ? null : String(pa.previousMargin.scaledUnits),
    currentMargin:
      pa.currentMargin === null ? null : String(pa.currentMargin.scaledUnits),
    suggestedSalePrice:
      pa.suggestedSalePrice === null
        ? null
        : String(pa.suggestedSalePrice.scaledUnits),
    costChanged: pa.costChanged,
  };
  const beforeState = {
    ...purchaseProduct.state,
    ...evidence,
    stateRevision: String(cmd.preconditions.expectedStateRevision),
  };
  return {
    purchase: {
      id: cmd.payload.purchaseId,
      productId: cmd.payload.productId,
      inventoryId,
      quantity: cmd.payload.quantity,
      unitCost: cmd.payload.unitCost,
      totalAmount: String(
        unitCost.multiplyByInteger(cmd.payload.quantity).scaledUnits,
      ),
      stockBefore: before.stock,
      stockAfter: after.stock,
      averageCostBefore: evidence.unitCost,
      averageCostAfter: String(after.unitCost!.scaledUnits),
      status: 'CONFIRMED',
      notes: null,
      effectiveAt: cmd.occurredAt,
      createdAt: time,
      updatedAt: time,
    },
    product: purchaseProduct.product,
    beforeState,
    afterState: {
      ...beforeState,
      stock: after.stock,
      unitCost: String(after.unitCost!.scaledUnits),
      lastMovementId: cmd.payload.movementId,
      stateRevision: String(BigInt(beforeState.stateRevision) + 1n),
    },
    movement: {
      id: cmd.payload.movementId,
      inventoryId,
      productId: cmd.payload.productId,
      type: 'PURCHASE',
      quantityDelta: cmd.payload.quantity,
      stockBefore: before.stock,
      stockAfter: after.stock,
      unitCostSnapshot: cmd.payload.unitCost,
      sourceType: 'PURCHASE',
      sourceId: cmd.payload.purchaseId,
      reversalOfMovementId: null,
      metadata: null,
      effectiveAt: cmd.occurredAt,
      createdAt: time,
      updatedAt: time,
    },
    priceAnalysis,
    committedRevision: '1',
    serverRecordedAt: time,
  };
}
export function purchaseReceipt(
  cmd: RegisterPurchaseCommand,
): OperationReceipt {
  const r = purchaseResult(cmd);
  return {
    operationId: cmd.operationId,
    status: 'ACCEPTED',
    changeSet: {
      inventoryId,
      revision: r.committedRevision,
      serverRecordedAt: r.serverRecordedAt,
      upserts: {
        products: [r.product],
        purchases: [r.purchase],
        inventoryStates: [r.afterState],
        inventoryMovements: [r.movement],
        sales: [],
        saleItems: [],
        stockAdjustments: [],
      },
      tombstones: [],
    },
  };
}
export const purchaseDetail = (cmd: RegisterPurchaseCommand) => ({
  purchase: purchaseResult(cmd).purchase,
  voidEligibility: { eligible: true, reason: null },
});
export function purchasesFixture(
  fetcher: typeof fetch,
  stored?: string,
  online = () => true,
) {
  const f = productsFixture(fetcher);
  if (stored) f.storage.setItem(PENDING_PURCHASE_KEY, stored);
  const client = createPurchasesClient(
      createApiClient({ baseUrl: 'https://api.example.test', fetcher }),
    ),
    purchases = new PurchasesController(
      client,
      f.products,
      f.controller,
      f.queries,
      f.storage,
      online,
    );
  return {
    ...f,
    purchaseClient: client,
    purchases,
    dispose() {
      purchases.dispose();
      f.dispose();
    },
  };
}
export async function settledPurchase(p: PurchasesController) {
  if (!['PREPARING', 'SENDING', 'CHECKING'].includes(p.snapshot().kind)) return;
  await new Promise<void>((resolve) => {
    const stop = p.subscribe(() => {
      if (!['PREPARING', 'SENDING', 'CHECKING'].includes(p.snapshot().kind)) {
        stop();
        resolve();
      }
    });
  });
}
