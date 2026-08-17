import { createInventory, type Inventory } from '@stock-app/domain';

import type { Clock } from './create-product';
import type { InventoryRepository } from './ports';

export interface InventoryIdGenerator {
  generate(): string;
}

export interface CreateInventoryInput {
  readonly name: string;
  readonly currency: string;
}

interface CreateInventoryDependencies {
  readonly inventoryIdGenerator: InventoryIdGenerator;
  readonly clock: Clock;
  readonly inventoryRepository: InventoryRepository;
}

export class CreateInventoryUseCase {
  constructor(private readonly dependencies: CreateInventoryDependencies) {}

  async execute(input: CreateInventoryInput): Promise<Inventory> {
    const inventoryId = this.dependencies.inventoryIdGenerator.generate();
    const creationTime = this.dependencies.clock.now();
    const inventory = createInventory({
      id: inventoryId,
      name: input.name,
      currency: input.currency,
      createdAt: creationTime,
      updatedAt: creationTime,
    });

    await this.dependencies.inventoryRepository.save(inventory);

    return inventory;
  }
}
