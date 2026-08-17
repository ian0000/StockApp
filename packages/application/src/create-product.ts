import {
  createInitialInventory,
  createInventoryMovement,
  createProduct,
  type InventoryMovement,
  type InventoryState,
  type Money,
  type Product,
  type TimestampMs,
} from '@stock-app/domain';

import type { TransactionManager } from './ports';

export interface ProductIdGenerator {
  generate(): string;
}

export interface InventoryMovementIdGenerator {
  generate(): string;
}

export interface Clock {
  now(): TimestampMs;
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

interface CreateProductDependencies {
  readonly productIdGenerator: ProductIdGenerator;
  readonly inventoryMovementIdGenerator: InventoryMovementIdGenerator;
  readonly clock: Clock;
  readonly transactionManager: TransactionManager;
}

export class CreateProductUseCase {
  constructor(private readonly dependencies: CreateProductDependencies) {}

  async execute(input: CreateProductInput): Promise<CreateProductResult> {
    const productId = this.dependencies.productIdGenerator.generate();
    const creationTime = this.dependencies.clock.now();
    const product = createProduct({
      id: productId,
      inventoryId: input.inventoryId,
      name: input.name,
      variant: input.variant,
      barcode: input.barcode,
      regularSalePrice: input.regularSalePrice,
      minimumStock: input.minimumStock,
      createdAt: creationTime,
      updatedAt: creationTime,
    });
    const initialInventory = createInitialInventory({
      initialStock: input.initialStock,
      initialUnitCost: input.initialUnitCost,
    });
    const initialMovement =
      initialInventory.movement === null
        ? null
        : createInventoryMovement({
            ...initialInventory.movement,
            id: this.dependencies.inventoryMovementIdGenerator.generate(),
            inventoryId: product.inventoryId,
            productId: product.id,
            effectiveAt: creationTime,
            createdAt: creationTime,
            updatedAt: creationTime,
          });

    const result = Object.freeze({
      product,
      inventory: initialInventory.inventory,
      initialMovement,
    });

    await this.dependencies.transactionManager.runInTransaction(
      async (repositories) => {
        await repositories.productRepository.save(result.product);
        await repositories.inventoryStateRepository.save({
          inventoryId: result.product.inventoryId,
          productId: result.product.id,
          state: result.inventory,
        });

        if (result.initialMovement !== null) {
          await repositories.inventoryMovementRepository.save(
            result.initialMovement,
          );
        }
      },
    );

    return result;
  }
}
