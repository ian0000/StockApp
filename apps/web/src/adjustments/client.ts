import type {
  AdjustStockCommand,
  AdjustStockCommandResult,
} from '@stock-app/contracts';
import {
  Money,
  applyStockAdjustment,
  createStockAdjustment,
  createTimestampMs,
} from '@stock-app/domain';
import { decodeMoney } from '@stock-app/contracts/transport';
import { ApiClientError, type createApiClient } from '../api/client.js';
import { requestCsrf } from '../api/csrf.js';
import type { AcceptedReceipt } from '../commands/controller.js';
import validateCommand from '../api/generated/adjust-stock-command.mjs';
import validateResult from '../api/generated/adjust-stock-result.mjs';
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const money = (value: string | null) =>
  value === null ? null : Money.fromScaledUnits(decodeMoney(value));
export function coherentAdjustment(
  r: AdjustStockCommandResult,
  inventoryId: string,
  command?: AdjustStockCommand,
) {
  const { adjustment: a, state: s, movement: m } = r;
  try {
    createStockAdjustment({
      ...a,
      unitCost: money(a.unitCost),
      effectiveAt: createTimestampMs(a.effectiveAt),
      createdAt: createTimestampMs(a.createdAt),
      updatedAt: createTimestampMs(a.updatedAt),
    });
    if (
      !same(a.inventoryId, inventoryId) ||
      !same(s.inventoryId, inventoryId) ||
      !same(m.inventoryId, inventoryId) ||
      !same(s.productId, a.productId) ||
      !same(m.productId, a.productId) ||
      s.stock !== a.actualStock ||
      s.lastMovementId === null ||
      !same(s.lastMovementId, m.id) ||
      m.type !== (a.difference > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT') ||
      m.sourceType !== 'STOCK_ADJUSTMENT' ||
      m.sourceId === null ||
      !same(m.sourceId, a.id) ||
      m.quantityDelta !== a.difference ||
      m.stockBefore !== a.stockBefore ||
      m.stockAfter !== a.actualStock ||
      m.unitCostSnapshot !== a.unitCost ||
      m.reversalOfMovementId !== null ||
      m.metadata !== null ||
      m.effectiveAt !== a.effectiveAt ||
      m.createdAt !== a.createdAt ||
      m.updatedAt !== a.updatedAt ||
      ((a.difference < 0 || a.stockBefore <= 0) && s.unitCost !== a.unitCost)
    )
      return false;
    if (!command) return true;
    const p = command.payload,
      e = command.preconditions.expectedState;
    const applied = applyStockAdjustment({
      inventory: { stock: e.stock, unitCost: money(e.unitCost) },
      actualStock: p.actualStock,
      costMode: p.costMode,
      customUnitCost: money(p.customUnitCost),
    });
    return (
      same(a.id, p.stockAdjustmentId) &&
      same(m.id, p.movementId) &&
      same(a.productId, p.productId) &&
      a.stockBefore === e.stock &&
      a.actualStock === p.actualStock &&
      a.reason === p.reason &&
      a.costMode === p.costMode &&
      a.effectiveAt === command.occurredAt &&
      a.createdAt === p.createdAt &&
      a.updatedAt === p.createdAt &&
      a.unitCost === String(applied.unitCost?.scaledUnits) &&
      s.unitCost === String(applied.inventory.unitCost?.scaledUnits) &&
      typeof command.preconditions.expectedStateRevision === 'string' &&
      BigInt(s.stateRevision) ===
        BigInt(command.preconditions.expectedStateRevision) + 1n
    );
  } catch {
    return false;
  }
}
export function recoverAdjustment(
  receipt: AcceptedReceipt,
  inventoryId: string,
  command?: AdjustStockCommand,
) {
  const { changeSet: c } = receipt,
    u = c.upserts;
  const r = {
    adjustment: u.stockAdjustments[0],
    state: u.inventoryStates[0],
    movement: u.inventoryMovements[0],
    committedRevision: c.revision,
    serverRecordedAt: c.serverRecordedAt,
  };
  if (
    !same(c.inventoryId, inventoryId) ||
    u.stockAdjustments.length !== 1 ||
    u.inventoryStates.length !== 1 ||
    u.inventoryMovements.length !== 1 ||
    u.products.length ||
    u.sales.length ||
    u.saleItems.length ||
    u.purchases.length ||
    c.tombstones.length ||
    !validateResult(r) ||
    !coherentAdjustment(r, inventoryId, command)
  )
    throw new ApiClientError('INVALID_JSON', 200);
  return r;
}
export function createAdjustmentsClient(
  api: ReturnType<typeof createApiClient>,
) {
  return {
    async register(
      inventoryId: string,
      command: AdjustStockCommand,
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
      const response = await api.request(
        `/v1/inventories/${encodeURIComponent(inventoryId)}/adjustments`,
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
        response.status !== 200 ||
        !validateResult(response.body) ||
        !coherentAdjustment(response.body, inventoryId, command)
      )
        throw new ApiClientError('INVALID_JSON', response.status);
      return response.body;
    },
  };
}
export type AdjustmentsClient = ReturnType<typeof createAdjustmentsClient>;
