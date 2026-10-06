import { Money, type Purchase } from '@stock-app/domain';
import {
  decodeMoney,
  encodeMoney,
  type PurchaseDto,
  type PriceAnalysisDto,
} from '@stock-app/contracts';
import type { PurchasePriceAnalysis } from '@stock-app/application';
import { moneyTransport } from '../sales/mappers.js';

export const transportMoney = (value: string | null) =>
  value === null ? null : Money.fromScaledUnits(decodeMoney(value));
export function purchaseDto(purchase: Purchase): PurchaseDto {
  return {
    ...purchase,
    unitCost: encodeMoney(purchase.unitCost.scaledUnits),
    totalAmount: encodeMoney(purchase.totalAmount.scaledUnits),
    averageCostBefore: moneyTransport(purchase.averageCostBefore),
    averageCostAfter: encodeMoney(purchase.averageCostAfter.scaledUnits),
  };
}
export function priceAnalysisDto(
  analysis: PurchasePriceAnalysis,
): PriceAnalysisDto {
  return {
    ...analysis,
    previousUnitCost: moneyTransport(analysis.previousUnitCost),
    currentUnitCost: encodeMoney(analysis.currentUnitCost.scaledUnits),
    regularSalePrice: encodeMoney(analysis.regularSalePrice.scaledUnits),
    previousMargin:
      analysis.previousMargin === null
        ? null
        : analysis.previousMargin.scaledUnits.toString(),
    currentMargin:
      analysis.currentMargin === null
        ? null
        : analysis.currentMargin.scaledUnits.toString(),
    suggestedSalePrice: moneyTransport(analysis.suggestedSalePrice),
  };
}
export function purchaseValues(purchase: Purchase) {
  return {
    ...purchase,
    quantity: BigInt(purchase.quantity),
    unitCostUnits: BigInt(purchase.unitCost.scaledUnits),
    totalAmountUnits: BigInt(purchase.totalAmount.scaledUnits),
    stockBefore: BigInt(purchase.stockBefore),
    stockAfter: BigInt(purchase.stockAfter),
    averageCostBeforeUnits:
      purchase.averageCostBefore === null
        ? null
        : BigInt(purchase.averageCostBefore.scaledUnits),
    averageCostAfterUnits: BigInt(purchase.averageCostAfter.scaledUnits),
    effectiveAt: BigInt(purchase.effectiveAt),
    createdAt: BigInt(purchase.createdAt),
    updatedAt: BigInt(purchase.updatedAt),
  };
}
