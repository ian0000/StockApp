import {
  archiveProduct,
  updateProduct,
  type Money,
  type Product,
} from '@stock-app/domain';

import type { Clock } from './create-product';
import type { ProductManagementRepository } from './ports';

export class ProductManagementUnavailableError extends Error {
  constructor() {
    super('Product is not available for management in this Inventory.');
    this.name = 'ProductManagementUnavailableError';
  }
}

export interface UpdateProductInput {
  readonly inventoryId: string;
  readonly productId: string;
  readonly name: string;
  readonly variant?: string | null;
  readonly barcode?: string | null;
  readonly regularSalePrice: Money;
  readonly minimumStock?: number | null;
}

export interface ArchiveProductInput {
  readonly inventoryId: string;
  readonly productId: string;
}

interface ProductManagementDependencies {
  readonly clock: Clock;
  readonly productRepository: ProductManagementRepository;
}

async function findManagedProduct(
  repository: ProductManagementRepository,
  inventoryId: string,
  productId: string,
): Promise<Product> {
  const product = await repository.findById(inventoryId, productId);

  if (
    product === null ||
    product.inventoryId !== inventoryId ||
    product.id !== productId
  ) {
    throw new ProductManagementUnavailableError();
  }

  return product;
}

export class UpdateProductUseCase {
  constructor(private readonly dependencies: ProductManagementDependencies) {}

  async execute(input: UpdateProductInput): Promise<Product> {
    const product = await findManagedProduct(
      this.dependencies.productRepository,
      input.inventoryId,
      input.productId,
    );

    if (product.isArchived) {
      throw new ProductManagementUnavailableError();
    }

    const updated = updateProduct(product, {
      name: input.name,
      variant: input.variant,
      barcode: input.barcode,
      regularSalePrice: input.regularSalePrice,
      minimumStock: input.minimumStock,
      updatedAt: this.dependencies.clock.now(),
    });

    await this.dependencies.productRepository.update(updated);
    return updated;
  }
}

export class ArchiveProductUseCase {
  constructor(private readonly dependencies: ProductManagementDependencies) {}

  async execute({
    inventoryId,
    productId,
  }: ArchiveProductInput): Promise<Product> {
    const product = await findManagedProduct(
      this.dependencies.productRepository,
      inventoryId,
      productId,
    );

    if (product.isArchived) return product;

    const archived = archiveProduct(product, this.dependencies.clock.now());
    await this.dependencies.productRepository.update(archived);
    return archived;
  }
}
