import {
  createInventoryState,
  Money,
  type Sale,
  type SaleItem,
} from '@stock-app/domain';
import {
  decodeMoney,
  encodeMoney,
  type SaleDto,
  type SaleItemDto,
} from '@stock-app/contracts';
import { inventoryStates } from '../infrastructure/postgres/schema.js';

export function stateFromRow(row: typeof inventoryStates.$inferSelect) {
  return createInventoryState({
    stock: decodeMoney(row.stock.toString()),
    unitCost:
      row.unitCostUnits === null
        ? null
        : Money.fromScaledUnits(decodeMoney(row.unitCostUnits.toString())),
  });
}
export const moneyTransport = (value: Money | null) =>
  value === null ? null : encodeMoney(value.scaledUnits);
const moneyUnits = (value: Money | null) =>
  value === null ? null : BigInt(value.scaledUnits);
export function saleDto(sale: Sale): SaleDto {
  return {
    ...sale,
    totalAmount: encodeMoney(sale.totalAmount.scaledUnits),
    estimatedCost: moneyTransport(sale.estimatedCost),
    estimatedProfit: moneyTransport(sale.estimatedProfit),
  };
}
export function saleItemDto(item: SaleItem, inventoryId: string): SaleItemDto {
  const common = {
    ...item,
    inventoryId,
    unitSalePrice: encodeMoney(item.unitSalePrice.scaledUnits),
    subtotal: encodeMoney(item.subtotal.scaledUnits),
  };
  if (item.costStatus === 'UNKNOWN')
    return {
      ...common,
      costStatus: 'UNKNOWN',
      unitCostSnapshot: null,
      estimatedCost: null,
      estimatedProfit: null,
    };
  if (
    item.unitCostSnapshot === null ||
    item.estimatedCost === null ||
    item.estimatedProfit === null
  )
    throw new Error('Incomplete known snapshot.');
  return {
    ...common,
    costStatus: 'KNOWN',
    unitCostSnapshot: encodeMoney(item.unitCostSnapshot.scaledUnits),
    estimatedCost: encodeMoney(item.estimatedCost.scaledUnits),
    estimatedProfit: encodeMoney(item.estimatedProfit.scaledUnits),
  };
}
export function saleValues(sale: Sale) {
  return {
    ...sale,
    totalAmountUnits: BigInt(sale.totalAmount.scaledUnits),
    estimatedCostUnits: moneyUnits(sale.estimatedCost),
    estimatedProfitUnits: moneyUnits(sale.estimatedProfit),
    effectiveAt: BigInt(sale.effectiveAt),
    createdAt: BigInt(sale.createdAt),
    updatedAt: BigInt(sale.updatedAt),
  };
}
export function saleItemValues(item: SaleItem, inventoryId: string) {
  return {
    ...item,
    inventoryId,
    quantity: BigInt(item.quantity),
    unitSalePriceUnits: BigInt(item.unitSalePrice.scaledUnits),
    subtotalUnits: BigInt(item.subtotal.scaledUnits),
    unitCostSnapshotUnits: moneyUnits(item.unitCostSnapshot),
    estimatedCostUnits: moneyUnits(item.estimatedCost),
    estimatedProfitUnits: moneyUnits(item.estimatedProfit),
    createdAt: BigInt(item.createdAt),
    updatedAt: BigInt(item.updatedAt),
  };
}
