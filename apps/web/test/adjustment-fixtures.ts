import type {
  AdjustStockCommand,
  AdjustStockCommandResult,
  OperationReceipt,
  ProductReadDto,
} from '@stock-app/contracts';
import { Money, applyStockAdjustment } from '@stock-app/domain';
import { decodeMoney } from '@stock-app/contracts/transport';
import { product, productsFixture, inventoryId } from './product-fixtures.js';
import { createApiClient } from '../src/api/client.js';
import { createAdjustmentsClient } from '../src/adjustments/client.js';
import {
  AdjustmentsController,
  PENDING_ADJUSTMENT_KEY,
} from '../src/adjustments/controller.js';
import { initialAdjustmentForm } from '../src/adjustments/input.js';
export const adjustmentProduct: ProductReadDto = {
  ...product,
  state: {
    ...product.state,
    stock: 10,
    unitCost: '10000000',
    stateRevision: '9007199254740993',
  },
};
export const adjustmentForm = () => ({
  ...initialAdjustmentForm(adjustmentProduct),
  actualStock: '12',
});
export function adjustmentResult(
  command: AdjustStockCommand,
): AdjustStockCommandResult {
  const p = command.payload,
    e = command.preconditions.expectedState,
    time = p.createdAt;
  const decode = (value: string | null) =>
    value === null ? null : Money.fromScaledUnits(decodeMoney(value));
  const applied = applyStockAdjustment({
    inventory: { stock: e.stock, unitCost: decode(e.unitCost) },
    actualStock: p.actualStock,
    costMode: p.costMode,
    customUnitCost: decode(p.customUnitCost),
  });
  return {
    adjustment: {
      id: p.stockAdjustmentId,
      inventoryId,
      productId: p.productId,
      stockBefore: e.stock,
      actualStock: p.actualStock,
      difference: applied.difference,
      reason: p.reason,
      costMode: p.costMode,
      unitCost: String(applied.unitCost!.scaledUnits),
      effectiveAt: command.occurredAt,
      createdAt: time,
      updatedAt: time,
    },
    state: {
      inventoryId,
      productId: p.productId,
      stock: p.actualStock,
      unitCost: String(applied.inventory.unitCost!.scaledUnits),
      stateRevision: String(
        BigInt(String(command.preconditions.expectedStateRevision)) + 1n,
      ),
      lastMovementId: p.movementId,
    },
    movement: {
      id: p.movementId,
      inventoryId,
      productId: p.productId,
      type: applied.difference > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
      quantityDelta: applied.difference,
      stockBefore: e.stock,
      stockAfter: p.actualStock,
      unitCostSnapshot: String(applied.unitCost!.scaledUnits),
      sourceType: 'STOCK_ADJUSTMENT',
      sourceId: p.stockAdjustmentId,
      reversalOfMovementId: null,
      metadata: null,
      effectiveAt: command.occurredAt,
      createdAt: time,
      updatedAt: time,
    },
    committedRevision: '1',
    serverRecordedAt: time,
  };
}
export function adjustmentReceipt(
  command: AdjustStockCommand,
): Extract<OperationReceipt, { status: 'ACCEPTED' }> {
  const r = adjustmentResult(command);
  return {
    operationId: command.operationId,
    status: 'ACCEPTED',
    changeSet: {
      inventoryId,
      revision: r.committedRevision,
      serverRecordedAt: r.serverRecordedAt,
      upserts: {
        products: [],
        purchases: [],
        sales: [],
        saleItems: [],
        stockAdjustments: [r.adjustment],
        inventoryStates: [r.state],
        inventoryMovements: [r.movement],
      },
      tombstones: [],
    },
  };
}
export function adjustmentsFixture(
  fetcher: typeof fetch,
  stored?: string,
  online = () => true,
) {
  const f = productsFixture(fetcher);
  if (stored) f.storage.setItem(PENDING_ADJUSTMENT_KEY, stored);
  const adjustmentClient = createAdjustmentsClient(
    createApiClient({ baseUrl: 'https://api.example.test', fetcher }),
  );
  const adjustments = new AdjustmentsController(
    adjustmentClient,
    f.products,
    f.controller,
    f.queries,
    f.storage,
    online,
  );
  return {
    ...f,
    adjustmentClient,
    adjustments,
    dispose() {
      adjustments.dispose();
      f.dispose();
    },
  };
}
export async function settledAdjustment(controller: AdjustmentsController) {
  if (
    !['PREPARING', 'SENDING', 'CHECKING'].includes(controller.snapshot().kind)
  )
    return;
  await new Promise<void>((resolve) => {
    const stop = controller.subscribe(() => {
      if (
        !['PREPARING', 'SENDING', 'CHECKING'].includes(
          controller.snapshot().kind,
        )
      ) {
        stop();
        resolve();
      }
    });
  });
}
