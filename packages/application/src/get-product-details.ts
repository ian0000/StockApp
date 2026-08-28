import {
  calculateEstimatedProfit,
  calculateMargin,
  calculateMarkup,
  isProductLowStock,
  type Money,
  type Percentage,
} from '@stock-app/domain';

import type { InventoryStateRepository, ProductRepository } from './ports';

export interface GetProductDetailsInput {
  readonly inventoryId: string;
  readonly productId: string;
}

export interface ProductDetails {
  readonly id: string;
  readonly name: string;
  readonly variant: string | null;
  readonly barcode: string | null;
  readonly minimumStock: number | null;
  readonly isLowStock: boolean;
  readonly stock: number;
  readonly unitCost: Money | null;
  readonly regularSalePrice: Money;
  readonly estimatedUnitProfit: Money | null;
  readonly margin: Percentage | null;
  readonly markup: Percentage | null;
}

interface GetProductDetailsDependencies {
  readonly productRepository: ProductRepository;
  readonly inventoryStateRepository: InventoryStateRepository;
}

function calculateAvailableMetric<Result>(
  calculation: () => Result | null,
): Result | null {
  try {
    return calculation();
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

export class GetProductDetailsUseCase {
  constructor(private readonly dependencies: GetProductDetailsDependencies) {}

  async execute({
    inventoryId,
    productId,
  }: GetProductDetailsInput): Promise<ProductDetails | null> {
    const [products, inventoryStates] = await Promise.all([
      this.dependencies.productRepository.listByInventory(inventoryId),
      this.dependencies.inventoryStateRepository.listByInventory(inventoryId),
    ]);
    const product = products.find(
      (candidate) =>
        candidate.id === productId &&
        candidate.inventoryId === inventoryId &&
        !candidate.isArchived,
    );

    if (product === undefined) return null;

    const inventoryState = inventoryStates.find(
      (candidate) =>
        candidate.inventoryId === inventoryId &&
        candidate.productId === productId,
    )?.state;

    if (inventoryState === undefined) {
      throw new Error(`Inventory state is missing for Product ${productId}.`);
    }

    const profitabilityInput =
      inventoryState.unitCost === null
        ? null
        : {
            salePrice: product.regularSalePrice,
            estimatedUnitCost: inventoryState.unitCost,
          };

    return Object.freeze({
      id: product.id,
      name: product.name,
      variant: product.variant,
      barcode: product.barcode,
      minimumStock: product.minimumStock,
      isLowStock: isProductLowStock(product, inventoryState),
      stock: inventoryState.stock,
      unitCost: inventoryState.unitCost,
      regularSalePrice: product.regularSalePrice,
      estimatedUnitProfit:
        profitabilityInput === null
          ? null
          : calculateEstimatedProfit(profitabilityInput),
      margin:
        profitabilityInput === null
          ? null
          : calculateAvailableMetric(() => calculateMargin(profitabilityInput)),
      markup:
        profitabilityInput === null
          ? null
          : calculateAvailableMetric(() => calculateMarkup(profitabilityInput)),
    });
  }
}
