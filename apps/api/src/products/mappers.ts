import {
  decodeMoney,
  encodeMoney,
  type ProductDto,
  type InventoryStateDto,
  type InventoryMovementDto,
} from '@stock-app/contracts';
import {
  Money,
  type Product,
  type InventoryState,
  type InventoryMovement,
} from '@stock-app/domain';
import { products } from '../infrastructure/postgres/schema.js';

export function productFromRow(row: typeof products.$inferSelect): Product {
  return {
    id: row.id,
    inventoryId: row.inventoryId,
    name: row.name,
    variant: row.variant,
    barcode: row.barcode,
    regularSalePrice: Money.fromScaledUnits(
      decodeMoney(row.regularSalePriceUnits.toString()),
    ),
    minimumStock:
      row.minimumStock === null
        ? null
        : decodeMoney(row.minimumStock.toString()),
    isArchived: row.isArchived,
    createdAt: decodeMoney(row.createdAt.toString()),
    updatedAt: decodeMoney(row.updatedAt.toString()),
  };
}

export function productDto(
  product: Product,
  metadataRevision: bigint,
): ProductDto {
  return {
    ...product,
    regularSalePrice: encodeMoney(product.regularSalePrice.scaledUnits),
    metadataRevision: metadataRevision.toString(),
  };
}

export function stateDto(
  inventoryId: string,
  productId: string,
  state: InventoryState,
  lastMovementId: string | null,
): InventoryStateDto {
  return {
    inventoryId,
    productId,
    stock: state.stock,
    unitCost:
      state.unitCost === null ? null : encodeMoney(state.unitCost.scaledUnits),
    stateRevision: '0',
    lastMovementId,
  };
}

export function movementDto(movement: InventoryMovement): InventoryMovementDto {
  return {
    ...movement,
    reversalOfMovementId: null,
    unitCostSnapshot:
      movement.unitCostSnapshot === null
        ? null
        : encodeMoney(movement.unitCostSnapshot.scaledUnits),
  };
}

export function productValues(product: Product) {
  return {
    id: product.id.toLowerCase(),
    inventoryId: product.inventoryId,
    name: product.name,
    variant: product.variant,
    barcode: product.barcode,
    regularSalePriceUnits: BigInt(product.regularSalePrice.scaledUnits),
    minimumStock:
      product.minimumStock === null ? null : BigInt(product.minimumStock),
    isArchived: product.isArchived,
    createdAt: BigInt(product.createdAt),
    updatedAt: BigInt(product.updatedAt),
  };
}

export function movementValues(movement: InventoryMovement) {
  return {
    ...movement,
    quantityDelta: BigInt(movement.quantityDelta),
    stockBefore: BigInt(movement.stockBefore),
    stockAfter: BigInt(movement.stockAfter),
    unitCostSnapshotUnits:
      movement.unitCostSnapshot === null
        ? null
        : BigInt(movement.unitCostSnapshot.scaledUnits),
    effectiveAt: BigInt(movement.effectiveAt),
    createdAt: BigInt(movement.createdAt),
    updatedAt: BigInt(movement.updatedAt),
  };
}
