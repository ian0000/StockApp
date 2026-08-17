import {
  createInitialInventory,
  createProduct,
  type InventoryMovement,
  type InventoryState,
  type Money,
  type Product,
} from '@stock-app/domain';

export interface ProductIdGenerator {
  generate(): string;
}

export interface CreateProductInput {
  readonly inventoryId: string;
  readonly name: string;
  readonly variant?: string | null;
  readonly barcode?: string | null;
  readonly regularSalePrice: Money;
  readonly minimumStock?: number | null;
  readonly initialStock: number;
  readonly initialUnitCost: Money | null;
}

export interface CreateProductResult {
  readonly product: Product;
  readonly inventory: InventoryState;
  readonly initialMovement: InventoryMovement | null;
}

export class CreateProductUseCase {
  constructor(private readonly productIdGenerator: ProductIdGenerator) {}

  execute(input: CreateProductInput): CreateProductResult {
    const productId = this.productIdGenerator.generate();
    const product = createProduct({
      id: productId,
      inventoryId: input.inventoryId,
      name: input.name,
      variant: input.variant,
      barcode: input.barcode,
      regularSalePrice: input.regularSalePrice,
      minimumStock: input.minimumStock,
    });
    const initialInventory = createInitialInventory({
      initialStock: input.initialStock,
      initialUnitCost: input.initialUnitCost,
    });

    return Object.freeze({
      product,
      inventory: initialInventory.inventory,
      initialMovement: initialInventory.movement,
    });
  }
}
