import assert from 'node:assert/strict';
import test from 'node:test';

import { createInventory, type Inventory } from '@stock-app/domain';

import {
  GetCurrentInventoryUseCase,
  MultipleInventoriesNotSupportedError,
  type InventoryRepository,
} from '../src/index';

function inventory(id: string, name = 'Mi Negocio'): Inventory {
  return createInventory({
    id,
    name,
    currency: 'USD',
    createdAt: 1_776_444_000_000,
    updatedAt: 1_776_444_000_000,
  });
}

class StubInventoryRepository implements InventoryRepository {
  listCalls = 0;

  constructor(
    readonly inventories: readonly Inventory[],
    private readonly listError: Error | null = null,
  ) {}

  async list(): Promise<readonly Inventory[]> {
    this.listCalls += 1;

    if (this.listError !== null) {
      throw this.listError;
    }

    return this.inventories;
  }

  async save(): Promise<void> {}
}

test('returns null when no Inventory exists', async () => {
  const repository = new StubInventoryRepository([]);
  const useCase = new GetCurrentInventoryUseCase(repository);

  assert.equal(await useCase.execute(), null);
});

test('returns the exact Inventory when one exists', async () => {
  const existingInventory = inventory('inventory-1');
  const repository = new StubInventoryRepository([existingInventory]);
  const useCase = new GetCurrentInventoryUseCase(repository);

  assert.strictEqual(await useCase.execute(), existingInventory);
});

test('rejects multiple inventories explicitly', async () => {
  const repository = new StubInventoryRepository([
    inventory('inventory-1'),
    inventory('inventory-2', 'Otra tienda'),
  ]);
  const useCase = new GetCurrentInventoryUseCase(repository);

  await assert.rejects(
    () => useCase.execute(),
    MultipleInventoriesNotSupportedError,
  );
});

test('propagates the original repository error', async () => {
  const error = new Error('inventory read failed');
  const repository = new StubInventoryRepository([], error);
  const useCase = new GetCurrentInventoryUseCase(repository);

  await assert.rejects(() => useCase.execute(), error);
});

test('does not mutate repository results', async () => {
  const existingInventory = inventory('inventory-1');
  const inventories = [existingInventory];
  const snapshot = [...inventories];
  const repository = new StubInventoryRepository(inventories);
  const useCase = new GetCurrentInventoryUseCase(repository);

  await useCase.execute();

  assert.deepEqual(inventories, snapshot);
  assert.strictEqual(inventories[0], existingInventory);
});

test('queries InventoryRepository exactly once', async () => {
  const repository = new StubInventoryRepository([]);
  const useCase = new GetCurrentInventoryUseCase(repository);

  await useCase.execute();

  assert.equal(repository.listCalls, 1);
});
