import type {
  InventoryStateRecord,
  SaveInventoryStateInput,
} from '@stock-app/application';
import {
  createInventory,
  createInventoryState,
  createProduct,
  Money,
  type Inventory,
  type InventoryMovement,
  type Product,
} from '@stock-app/domain';

import {
  inventories,
  inventoryMovements,
  inventoryStates,
  products,
} from '../schema';

export function mapInventoryToRow(
  inventory: Inventory,
): typeof inventories.$inferInsert {
  return {
    id: inventory.id,
    name: inventory.name,
    currency: inventory.currency,
    createdAt: inventory.createdAt,
    updatedAt: inventory.updatedAt,
  };
}

export function mapInventoryRowToDomain(
  row: typeof inventories.$inferSelect,
): Inventory {
  return createInventory({
    id: row.id,
    name: row.name,
    currency: row.currency,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

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

export function mapProductRowToDomain(
  row: typeof products.$inferSelect,
): Product {
  const product = createProduct({
    id: row.id,
    inventoryId: row.inventoryId,
    name: row.name,
    variant: row.variant,
    barcode: row.barcode,
    regularSalePrice: Money.fromScaledUnits(row.regularSalePriceUnits),
    minimumStock: row.minimumStock,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

  return row.isArchived
    ? Object.freeze({ ...product, isArchived: true })
    : product;
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

export function mapInventoryStateRowToRecord(
  row: typeof inventoryStates.$inferSelect,
): InventoryStateRecord {
  return Object.freeze({
    inventoryId: row.inventoryId,
    productId: row.productId,
    state: createInventoryState({
      stock: row.stock,
      unitCost:
        row.unitCostUnits === null
          ? null
          : Money.fromScaledUnits(row.unitCostUnits),
    }),
  });
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
