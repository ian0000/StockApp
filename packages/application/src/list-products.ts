import {
  isProductLowStock,
  type InventoryState,
  type Product,
} from '@stock-app/domain';

import type { InventoryStateRepository, ProductRepository } from './ports';

export interface ListProductsInput {
  readonly inventoryId: string;
}

export interface ProductSummary {
  readonly product: Product;
  readonly state: InventoryState;
  readonly isLowStock: boolean;
}

interface ListProductsDependencies {
  readonly productRepository: ProductRepository;
  readonly inventoryStateRepository: InventoryStateRepository;
}

function compareNewestFirst(left: Product, right: Product): number {
  if (left.createdAt !== right.createdAt) {
    return right.createdAt - left.createdAt;
  }

  if (left.id === right.id) {
    return 0;
  }

  return left.id < right.id ? 1 : -1;
}

export class ListProductsUseCase {
  constructor(private readonly dependencies: ListProductsDependencies) {}

  async execute({
    inventoryId,
  }: ListProductsInput): Promise<readonly ProductSummary[]> {
    const [products, inventoryStates] = await Promise.all([
      this.dependencies.productRepository.listByInventory(inventoryId),
      this.dependencies.inventoryStateRepository.listByInventory(inventoryId),
    ]);
    const statesByProductId = new Map(
      inventoryStates
        .filter((record) => record.inventoryId === inventoryId)
        .map((record) => [record.productId, record.state] as const),
    );

    return products
      .filter(
        (product) => product.inventoryId === inventoryId && !product.isArchived,
      )
      .slice()
      .sort(compareNewestFirst)
      .map((product) => {
        const state = statesByProductId.get(product.id);

        if (state === undefined) {
          throw new Error(
            `Inventory state is missing for Product ${product.id}.`,
          );
        }

        return Object.freeze({
          product,
          state,
          isLowStock: isProductLowStock(product, state),
        });
      });
  }
}
