import type {
  RegisterSaleCommand,
  RegisterSaleCommandResult,
  SaleDto,
  SaleItemDto,
  OperationReceipt,
} from '@stock-app/contracts';
import { Money, createSale, createSaleItem } from '@stock-app/domain';
import { decodeMoney } from '@stock-app/contracts/transport';
import { ApiClientError, type createApiClient } from '../api/client.js';
import { requestCsrf } from '../api/csrf.js';
import validateCommand from '../api/generated/register-sale-command.mjs';
import validateResult from '../api/generated/register-sale-result.mjs';
import validateDetail from '../api/generated/sale-detail.mjs';
import type { AcceptedReceipt } from '../commands/controller.js';

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const prefix = (inventoryId: string) =>
  `/v1/inventories/${encodeURIComponent(inventoryId)}/sales`;
const unique = (ids: readonly string[]) =>
  new Set(ids.map((id) => id.toLowerCase())).size === ids.length;
const money = (value: string | null) =>
  value === null ? null : Money.fromScaledUnits(decodeMoney(value));
function validSale(
  sale: SaleDto,
  items: readonly SaleItemDto[],
  inventoryId: string,
) {
  if (
    !same(sale.inventoryId, inventoryId) ||
    !items.length ||
    !unique(items.map((i) => i.id)) ||
    !unique(items.map((i) => i.productId)) ||
    items.some(
      (i) => !same(i.inventoryId, inventoryId) || !same(i.saleId, sale.id),
    )
  )
    return false;
  try {
    createSale({
      ...sale,
      totalAmount: money(sale.totalAmount)!,
      estimatedCost: money(sale.estimatedCost),
      estimatedProfit: money(sale.estimatedProfit),
    });
    let total = Money.zero();
    for (const item of items) {
      createSaleItem({
        ...item,
        unitSalePrice: money(item.unitSalePrice)!,
        subtotal: money(item.subtotal)!,
        unitCostSnapshot: money(item.unitCostSnapshot),
        estimatedCost: money(item.estimatedCost),
        estimatedProfit: money(item.estimatedProfit),
      });
      total = total.add(money(item.subtotal)!);
    }
    if (String(total.scaledUnits) !== sale.totalAmount) return false;
    if (items.some((i) => i.costStatus === 'UNKNOWN'))
      return sale.estimatedCost === null && sale.estimatedProfit === null;
    const cost = items.reduce(
      (sum, i) => sum.add(money(i.estimatedCost)!),
      Money.zero(),
    );
    return String(cost.scaledUnits) === sale.estimatedCost;
  } catch {
    return false;
  }
}
function ownResult(
  result: RegisterSaleCommandResult,
  inventoryId: string,
  command?: RegisterSaleCommand,
) {
  const { sale, items, movements, states } = result;
  if (
    !validSale(sale, items, inventoryId) ||
    sale.status !== 'CONFIRMED' ||
    movements.length !== items.length ||
    states.length !== items.length ||
    !unique(movements.map((m) => m.id)) ||
    !unique(movements.map((m) => m.productId)) ||
    !unique(states.map((s) => s.productId))
  )
    return false;
  if (
    command &&
    (!same(sale.id, command.payload.saleId) ||
      items.length !== command.payload.items.length ||
      sale.effectiveAt !== command.occurredAt ||
      sale.createdAt !== command.payload.createdAt ||
      sale.notes !== command.payload.notes)
  )
    return false;
  for (const item of items) {
    const movement = movements.find((m) => same(m.productId, item.productId)),
      state = states.find((s) => same(s.productId, item.productId));
    if (
      !movement ||
      !state ||
      !same(movement.inventoryId, inventoryId) ||
      !same(state.inventoryId, inventoryId) ||
      movement.type !== 'SALE' ||
      movement.sourceType !== 'SALE' ||
      !movement.sourceId ||
      !same(movement.sourceId, sale.id) ||
      movement.quantityDelta !== -item.quantity ||
      movement.unitCostSnapshot !== item.unitCostSnapshot ||
      movement.reversalOfMovementId !== null ||
      !state.lastMovementId ||
      !same(state.lastMovementId, movement.id) ||
      state.stock !== movement.stockAfter ||
      state.unitCost !== item.unitCostSnapshot
    )
      return false;
    if (command) {
      const line = command.payload.items.find((l) =>
          same(l.productId, item.productId),
        ),
        cost = command.preconditions.expectedCosts.find((e) =>
          same(e.productId, item.productId),
        );
      if (
        !line ||
        !cost ||
        !same(line.saleItemId, item.id) ||
        !same(line.movementId, movement.id) ||
        line.quantity !== item.quantity ||
        line.unitSalePrice !== item.unitSalePrice ||
        cost.unitCostSnapshot !== item.unitCostSnapshot ||
        cost.estimatedCost !== item.estimatedCost ||
        cost.estimatedProfit !== item.estimatedProfit
      )
        return false;
    }
  }
  return true;
}
export function recoverSale(
  receipt: AcceptedReceipt,
  inventoryId: string,
  command?: RegisterSaleCommand,
) {
  const { changeSet } = receipt,
    upserts = changeSet.upserts,
    sale = upserts.sales[0];
  const result = {
    sale,
    items: upserts.saleItems,
    movements: upserts.inventoryMovements,
    states: upserts.inventoryStates,
    committedRevision: changeSet.revision,
    serverRecordedAt: changeSet.serverRecordedAt,
  };
  if (
    !same(changeSet.inventoryId, inventoryId) ||
    upserts.sales.length !== 1 ||
    upserts.products.length ||
    upserts.purchases.length ||
    upserts.stockAdjustments.length ||
    changeSet.tombstones.length ||
    !validateResult(result) ||
    !ownResult(result, inventoryId, command)
  )
    throw new ApiClientError('INVALID_JSON', 200);
  return result.sale.id;
}
export function createSalesClient(api: ReturnType<typeof createApiClient>) {
  return {
    async register(
      inventoryId: string,
      command: RegisterSaleCommand,
      signal: AbortSignal,
      beforeSend: () => void,
    ) {
      if (
        !validateCommand(command) ||
        !unique(command.payload.items.map((i) => i.productId))
      )
        throw new ApiClientError('INVALID_JSON', null);
      const token = await requestCsrf(api, signal);
      beforeSend();
      const response = await api.request(prefix(inventoryId), {
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
        !ownResult(response.body, inventoryId, command)
      )
        throw new ApiClientError('INVALID_JSON', response.status);
      return response.body;
    },
    async detail(inventoryId: string, saleId: string, signal: AbortSignal) {
      try {
        const response = await api.request(
          `${prefix(inventoryId)}/${encodeURIComponent(saleId)}`,
          { signal },
        );
        if (
          response.status !== 200 ||
          !validateDetail(response.body) ||
          !same(response.body.sale.id, saleId) ||
          !validSale(response.body.sale, response.body.items, inventoryId)
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
export type SalesClient = ReturnType<typeof createSalesClient>;
export type { OperationReceipt };
