import { encodeMoney, type AdjustmentDto } from '@stock-app/contracts';
import type { StockAdjustment } from '@stock-app/domain';

export function adjustmentDto(adjustment: StockAdjustment): AdjustmentDto {
  if (adjustment.unitCost === null)
    throw new Error('Missing resolved adjustment cost.');
  return {
    ...adjustment,
    unitCost: encodeMoney(adjustment.unitCost.scaledUnits),
  };
}
export function adjustmentValues(adjustment: StockAdjustment) {
  if (adjustment.unitCost === null)
    throw new Error('Missing resolved adjustment cost.');
  return {
    ...adjustment,
    stockBefore: BigInt(adjustment.stockBefore),
    actualStock: BigInt(adjustment.actualStock),
    difference: BigInt(adjustment.difference),
    unitCostUnits: BigInt(adjustment.unitCost.scaledUnits),
    effectiveAt: BigInt(adjustment.effectiveAt),
    createdAt: BigInt(adjustment.createdAt),
    updatedAt: BigInt(adjustment.updatedAt),
  };
}
