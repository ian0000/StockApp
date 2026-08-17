import type { SaveInventoryStateInput } from '@stock-app/application';
import type { InventoryMovement, Product } from '@stock-app/domain';

import { inventoryMovements, inventoryStates, products } from '../schema';

export function mapProductToRow(
  product: Product,
): typeof products.$inferInsert {
  return {
    id: product.id,
    inventoryId: product.inventoryId,
    name: product.name,
    variant: product.variant,
    barcode: product.barcode,
    regularSalePriceUnits: product.regularSalePrice.scaledUnits,
    minimumStock: product.minimumStock,
    isArchived: product.isArchived,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

export function mapInventoryStateToRow({
  inventoryId,
  productId,
  state,
}: SaveInventoryStateInput): typeof inventoryStates.$inferInsert {
  return {
    inventoryId,
    productId,
    stock: state.stock,
    unitCostUnits: state.unitCost?.scaledUnits ?? null,
  };
}

export function mapInventoryMovementToRow(
  movement: InventoryMovement,
): typeof inventoryMovements.$inferInsert {
  return {
    id: movement.id,
    inventoryId: movement.inventoryId,
    productId: movement.productId,
    type: movement.type,
    quantityDelta: movement.quantityDelta,
    unitCostSnapshotUnits: movement.unitCostSnapshot?.scaledUnits ?? null,
    stockBefore: movement.stockBefore,
    stockAfter: movement.stockAfter,
    sourceType: movement.sourceType,
    sourceId: movement.sourceId,
    metadata: movement.metadata,
    effectiveAt: movement.effectiveAt,
    createdAt: movement.createdAt,
    updatedAt: movement.updatedAt,
  };
}
