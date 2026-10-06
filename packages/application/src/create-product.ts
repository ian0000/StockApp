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
import {
  requireNewIdentities,
  validateCommandTimes,
  type CommandTimes,
} from './command-identity';

export interface ProductIdGenerator {
  generate(): string;
}

export interface InventoryMovementIdGenerator {
  generate(): string;
}

export interface Clock {
  now(): TimestampMs;
}

export interface CreateProductInput extends CommandTimes {
  readonly productId: string;
  readonly initialMovementId: string | null;
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
  readonly transactionManager: TransactionManager;
}

export class CreateProductUseCase {
  constructor(private readonly dependencies: CreateProductDependencies) {}

  async execute(input: CreateProductInput): Promise<CreateProductResult> {
    const productId = input.productId;
    const creationTime = input.createdAt;
    validateCommandTimes(input);
    requireNewIdentities([
      productId,
      ...(input.initialMovementId === null ? [] : [input.initialMovementId]),
    ]);
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
    if (
      (initialInventory.movement === null) !==
      (input.initialMovementId === null)
    )
      throw new TypeError(
        'Initial stock and its caller movement identity must correspond.',
      );
    let initialMovement: InventoryMovement | null = null;
    if (
      initialInventory.movement !== null &&
      input.initialMovementId !== null
    ) {
      initialMovement = createInventoryMovement({
        ...initialInventory.movement,
        id: input.initialMovementId,
        inventoryId: product.inventoryId,
        productId: product.id,
        effectiveAt: input.occurredAt,
        createdAt: creationTime,
        updatedAt: creationTime,
      });
    }

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
