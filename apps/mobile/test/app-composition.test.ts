import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CreateInventoryUseCase,
  CreateProductUseCase,
  type InventoryRepository,
  type TransactionManager,
} from '@stock-app/application';

import {
  assembleAppServices,
  initializeAppServices,
  type AppServiceDependencies,
} from '../src/composition/app-services';

function createDependencies(): {
  readonly dependencies: AppServiceDependencies;
  readonly getInventorySaveCount: () => number;
  readonly getTransactionCount: () => number;
} {
  let inventorySaveCount = 0;
  let transactionCount = 0;
  const inventoryRepository: InventoryRepository = {
    async save() {
      inventorySaveCount += 1;
    },
  };
  const transactionManager: TransactionManager = {
    async runInTransaction() {
      transactionCount += 1;
      throw new Error('A use case was executed during composition.');
    },
  };

  return {
    dependencies: {
      clock: { now: () => 1_776_444_000_000 },
      idGenerator: { generate: () => 'test-id' },
      inventoryRepository,
      transactionManager,
    },
    getInventorySaveCount: () => inventorySaveCount,
    getTransactionCount: () => transactionCount,
  };
}

test('composition exposes both application use cases and nothing else', () => {
  const { dependencies } = createDependencies();

  const services = assembleAppServices(dependencies);

  assert.deepEqual(Object.keys(services).sort(), [
    'createInventory',
    'createProduct',
  ]);
  assert.ok(services.createInventory instanceof CreateInventoryUseCase);
  assert.ok(services.createProduct instanceof CreateProductUseCase);
});

test('composition creates no rows or transactions automatically', () => {
  const { dependencies, getInventorySaveCount, getTransactionCount } =
    createDependencies();

  assembleAppServices(dependencies);

  assert.equal(getInventorySaveCount(), 0);
  assert.equal(getTransactionCount(), 0);
});

test('composition initialization is deferred until explicitly requested', async () => {
  let initializationCount = 0;
  const { dependencies } = createDependencies();
  const initialize = async (): Promise<AppServiceDependencies> => {
    initializationCount += 1;
    return dependencies;
  };

  assert.equal(initializationCount, 0);

  const services = await initializeAppServices(initialize);

  assert.equal(initializationCount, 1);
  assert.ok(services.createInventory instanceof CreateInventoryUseCase);
});

test('composition propagates initialization failures unchanged', async () => {
  const initializationError = new Error('migration failed');

  await assert.rejects(
    () =>
      initializeAppServices(async () => {
        throw initializationError;
      }),
    (error) => error === initializationError,
  );
});
