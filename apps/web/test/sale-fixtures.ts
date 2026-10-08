import type {
  RegisterSaleCommand,
  RegisterSaleCommandResult,
  OperationReceipt,
  SaleDetailDto,
  ProductReadDto,
} from '@stock-app/contracts';
import { Money } from '@stock-app/domain';
import { decodeMoney } from '@stock-app/contracts/transport';
import { createApiClient } from '../src/api/client.js';
import { createSalesClient } from '../src/sales/client.js';
import { SalesController, PENDING_SALE_KEY } from '../src/sales/controller.js';
import { addProduct } from '../src/sales/cart.js';
import {
  productsFixture,
  product,
  operationId,
  inventoryId,
  json,
} from './product-fixtures.js';

export const saleProduct: ProductReadDto = {
  ...product,
  product: { ...product.product, regularSalePrice: '1234567' },
  state: { ...product.state, stock: 10, unitCost: '2000000' },
};
export const secondProduct: ProductReadDto = {
  ...saleProduct,
  product: { ...saleProduct.product, id: operationId, name: 'Segundo' },
  state: { ...saleProduct.state, productId: operationId, unitCost: null },
};
export const initialCart = () => addProduct([], saleProduct);
export const csrf = () => json({ token: 'csrf-sale' });
export function saleResult(
  command: RegisterSaleCommand,
): RegisterSaleCommandResult {
  const time = command.payload.createdAt,
    saleId = command.payload.saleId;
  const items = command.payload.items.map((line) => {
    const evidence = command.preconditions.expectedCosts.find(
      (e) => e.productId === line.productId,
    )!;
    const base = {
      id: line.saleItemId,
      inventoryId,
      saleId,
      productId: line.productId,
      quantity: line.quantity,
      unitSalePrice: line.unitSalePrice,
      subtotal: String(
        Money.fromScaledUnits(
          decodeMoney(line.unitSalePrice),
        ).multiplyByInteger(line.quantity).scaledUnits,
      ),
      createdAt: time,
      updatedAt: time,
    };
    return evidence.unitCostSnapshot === null
      ? {
          ...base,
          costStatus: 'UNKNOWN' as const,
          unitCostSnapshot: null,
          estimatedCost: null,
          estimatedProfit: null,
        }
      : {
          ...base,
          costStatus: 'KNOWN' as const,
          unitCostSnapshot: evidence.unitCostSnapshot,
          estimatedCost: evidence.estimatedCost!,
          estimatedProfit: evidence.estimatedProfit!,
        };
  });
  const total = items.reduce(
    (sum, i) => sum.add(Money.fromScaledUnits(decodeMoney(i.subtotal))),
    Money.zero(),
  );
  const known = items.every((i) => i.costStatus === 'KNOWN');
  const cost = known
    ? items.reduce(
        (sum, i) =>
          sum.add(Money.fromScaledUnits(decodeMoney(i.estimatedCost))),
        Money.zero(),
      )
    : null;
  const movements = command.payload.items.map((line, i) => ({
    id: line.movementId,
    inventoryId,
    productId: line.productId,
    type: 'SALE' as const,
    quantityDelta: -line.quantity,
    stockBefore: 10,
    stockAfter: 10 - line.quantity,
    unitCostSnapshot: items[i].unitCostSnapshot,
    sourceType: 'SALE',
    sourceId: saleId,
    reversalOfMovementId: null,
    metadata: null,
    effectiveAt: command.occurredAt,
    createdAt: time,
    updatedAt: time,
  }));
  return {
    sale: {
      id: saleId,
      inventoryId,
      status: 'CONFIRMED',
      totalAmount: String(total.scaledUnits),
      estimatedCost: cost === null ? null : String(cost.scaledUnits),
      estimatedProfit:
        cost === null ? null : String(total.subtract(cost).scaledUnits),
      notes: null,
      effectiveAt: command.occurredAt,
      createdAt: time,
      updatedAt: time,
    },
    items,
    movements,
    states: command.payload.items.map((line, i) => ({
      inventoryId,
      productId: line.productId,
      stock: movements[i].stockAfter,
      unitCost: items[i].unitCostSnapshot,
      lastMovementId: line.movementId,
      stateRevision: '1',
    })),
    committedRevision: '1',
    serverRecordedAt: time,
  };
}
export function saleDetail(command: RegisterSaleCommand): SaleDetailDto {
  const result = saleResult(command);
  return {
    sale: result.sale,
    items: result.items.map((item) => ({
      ...item,
      productName: 'Nombre actual',
      productVariant: null,
    })),
    voidEligibility: { eligible: true, reason: null },
  };
}
export function saleReceipt(command: RegisterSaleCommand): OperationReceipt {
  const result = saleResult(command);
  return {
    operationId: command.operationId,
    status: 'ACCEPTED',
    changeSet: {
      inventoryId,
      revision: '1',
      serverRecordedAt: result.serverRecordedAt,
      upserts: {
        products: [],
        inventoryStates: result.states,
        sales: [result.sale],
        saleItems: result.items,
        inventoryMovements: result.movements,
        purchases: [],
        stockAdjustments: [],
      },
      tombstones: [],
    },
  };
}
export class InspectableSales extends SalesController {
  preparedCommand() {
    return this.intent;
  }
}
export function salesFixture(
  fetcher: typeof fetch = async (input) =>
    String(input).endsWith('/csrf') ? csrf() : json(saleProduct),
  stored?: string,
  online: () => boolean = () => true,
) {
  const base = productsFixture(fetcher);
  if (stored) base.storage.setItem(PENDING_SALE_KEY, stored);
  const sales = new InspectableSales(
    createSalesClient(
      createApiClient({ baseUrl: 'https://api.example.test', fetcher }),
    ),
    base.client,
    base.controller,
    base.queries,
    base.storage,
    online,
  );
  return {
    ...base,
    sales,
    dispose() {
      sales.dispose();
      base.dispose();
    },
  };
}
export async function settledSale(sales: SalesController) {
  if (!['SENDING', 'PREPARING', 'CHECKING'].includes(sales.snapshot().kind))
    return;
  await new Promise<void>((resolve) => {
    const stop = sales.subscribe(() => {
      if (
        !['SENDING', 'PREPARING', 'CHECKING'].includes(sales.snapshot().kind)
      ) {
        stop();
        resolve();
      }
    });
  });
}
