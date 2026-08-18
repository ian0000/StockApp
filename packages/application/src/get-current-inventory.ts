import type { Inventory } from '@stock-app/domain';

import type { InventoryRepository } from './ports';

export class MultipleInventoriesNotSupportedError extends Error {
  constructor() {
    super('Multiple inventories are not supported by the V1 mobile UI.');
    this.name = 'MultipleInventoriesNotSupportedError';
  }
}

export class GetCurrentInventoryUseCase {
  constructor(private readonly inventoryRepository: InventoryRepository) {}

  async execute(): Promise<Inventory | null> {
    const inventories = await this.inventoryRepository.list();

    if (inventories.length > 1) {
      throw new MultipleInventoriesNotSupportedError();
    }

    return inventories[0] ?? null;
  }
}
