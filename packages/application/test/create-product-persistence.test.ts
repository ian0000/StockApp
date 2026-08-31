import assert from 'node:assert/strict';
import test from 'node:test';

import {
  Money,
  type InventoryMovement,
  type InventoryState,
  type Product,
} from '@stock-app/domain';

import {
  CreateProductUseCase,
  type Clock,
  type CreateProductInput,
  type InventoryMovementIdGenerator,
  type InventoryMovementRepository,
  type InventoryStateRepository,
  type ProductIdGenerator,
  type ProductRepository,
  type SaveInventoryStateInput,
  type TransactionManager,
  type TransactionRepositories,
} from '../src/index';
import {
  unusedPurchaseVoidRepository,
  unusedSaleVoidRepository,
} from './support/unused-sale-void-repository';

class FakeProductIdGenerator implements ProductIdGenerator {
  calls = 0;

  constructor(private readonly ids: readonly string[]) {}

  generate(): string {
    const id = this.ids[this.calls];
    this.calls += 1;

    if (id === undefined) {
      throw new Error('Fake product ID sequence exhausted.');
    }

    return id;
  }
}

class FakeInventoryMovementIdGenerator implements InventoryMovementIdGenerator {
  calls = 0;

  constructor(private readonly ids: readonly string[]) {}

  generate(): string {
    const id = this.ids[this.calls];
    this.calls += 1;

    if (id === undefined) {
      throw new Error('Fake movement ID sequence exhausted.');
    }

    return id;
  }
}

class FakeClock implements Clock {
  calls = 0;

  constructor(readonly value: number) {}

  now(): number {
    this.calls += 1;
    return this.value;
  }
}

class RecordingTransactionManager implements TransactionManager {
  calls = 0;
  isActive = false;

  constructor(
    readonly events: string[],
    private readonly getRepositories: () => TransactionRepositories,
    private readonly error: Error | null = null,
  ) {}

  async runInTransaction<T>(
    operation: (repositories: TransactionRepositories) => Promise<T>,
  ): Promise<T> {
    this.calls += 1;
    this.events.push('transaction:start');

    if (this.error !== null) {
      throw this.error;
    }

    this.isActive = true;

    try {
      const result = await operation(this.getRepositories());
      this.events.push('transaction:complete');
      return result;
    } finally {
      this.isActive = false;
    }
  }
}

class RecordingProductRepository implements ProductRepository {
  readonly calls: Product[] = [];
  readonly transactionStates: boolean[] = [];

  constructor(
    private readonly events: string[],
    private readonly isTransactionActive: () => boolean,
    private readonly error: Error | null = null,
  ) {}

  async listByInventory(): Promise<readonly Product[]> {
    return [];
  }

  async save(product: Product): Promise<void> {
    this.events.push('product');
    this.calls.push(product);
    this.transactionStates.push(this.isTransactionActive());

    if (this.error !== null) {
      throw this.error;
    }
  }
}

class RecordingInventoryStateRepository implements InventoryStateRepository {
  readonly calls: SaveInventoryStateInput[] = [];
  readonly transactionStates: boolean[] = [];

  constructor(
    private readonly events: string[],
    private readonly isTransactionActive: () => boolean,
    private readonly error: Error | null = null,
  ) {}

  async listByInventory() {
    return [];
  }

  async save(input: SaveInventoryStateInput): Promise<void> {
    this.events.push('inventory');
    this.calls.push(input);
    this.transactionStates.push(this.isTransactionActive());

    if (this.error !== null) {
      throw this.error;
    }
  }

  async update(): Promise<void> {}
}

class RecordingInventoryMovementRepository implements InventoryMovementRepository {
  readonly calls: InventoryMovement[] = [];
  readonly transactionStates: boolean[] = [];

  constructor(
    private readonly events: string[],
    private readonly isTransactionActive: () => boolean,
    private readonly error: Error | null = null,
  ) {}

  async save(movement: InventoryMovement): Promise<void> {
    this.events.push('movement');
    this.calls.push(movement);
    this.transactionStates.push(this.isTransactionActive());

    if (this.error !== null) {
      throw this.error;
    }
  }
}

interface HarnessOptions {
  readonly ids?: readonly string[];
  readonly movementIds?: readonly string[];
  readonly timestamp?: number;
  readonly productError?: Error;
  readonly inventoryError?: Error;
  readonly movementError?: Error;
  readonly transactionError?: Error;
}

function validInput(
  overrides: Partial<CreateProductInput> = {},
): CreateProductInput {
  return {
    inventoryId: 'inventory-123',
    name: 'Coca Cola',
    variant: 'Original',
    barcode: '001234567890',
    regularSalePrice: Money.fromDecimal('1.25'),
    minimumStock: 5,
    initialStock: 0,
    initialUnitCost: null,
    ...overrides,
  };
}

function createHarness(options: HarnessOptions = {}) {
  const events: string[] = [];
  const productIdGenerator = new FakeProductIdGenerator(
    options.ids ?? ['product-123'],
  );
  const inventoryMovementIdGenerator = new FakeInventoryMovementIdGenerator(
    options.movementIds ?? ['movement-123'],
  );
  const clock = new FakeClock(options.timestamp ?? 1_776_444_000_000);
  let transactionRepositories: TransactionRepositories;
  const transactionManager = new RecordingTransactionManager(
    events,
    () => transactionRepositories,
    options.transactionError ?? null,
  );
  const productRepository = new RecordingProductRepository(
    events,
    () => transactionManager.isActive,
    options.productError ?? null,
  );
  const inventoryStateRepository = new RecordingInventoryStateRepository(
    events,
    () => transactionManager.isActive,
    options.inventoryError ?? null,
  );
  const inventoryMovementRepository = new RecordingInventoryMovementRepository(
    events,
    () => transactionManager.isActive,
    options.movementError ?? null,
  );
  transactionRepositories = {
    productRepository,
    inventoryStateRepository,
    inventoryMovementRepository,
    purchaseRepository: { async save() {} },
    saleRepository: { async save() {} },
    saleItemRepository: { async save() {} },
    stockAdjustmentRepository: { async save() {} },
    saleVoidRepository: unusedSaleVoidRepository,
    purchaseVoidRepository: unusedPurchaseVoidRepository,
  };
  const useCase = new CreateProductUseCase({
    productIdGenerator,
    inventoryMovementIdGenerator,
    clock,
    transactionManager,
  });

  return {
    events,
    productIdGenerator,
    inventoryMovementIdGenerator,
    clock,
    transactionManager,
    productRepository,
    inventoryStateRepository,
    inventoryMovementRepository,
    useCase,
  };
}

test('execute returns a Promise', async () => {
  const { useCase } = createHarness();

  const execution = useCase.execute(validInput());

  assert.ok(execution instanceof Promise);
  await execution;
});

test('zero-stock creation uses one transaction', async () => {
  const { useCase, transactionManager } = createHarness();

  await useCase.execute(validInput());

  assert.equal(transactionManager.calls, 1);
});

test('zero-stock creation saves the product once', async () => {
  const { useCase, productRepository } = createHarness();

  await useCase.execute(validInput());

  assert.equal(productRepository.calls.length, 1);
});

test('zero-stock creation saves inventory state once', async () => {
  const { useCase, inventoryStateRepository } = createHarness();

  await useCase.execute(validInput());

  assert.equal(inventoryStateRepository.calls.length, 1);
});

test('zero-stock creation does not save a movement', async () => {
  const { useCase, inventoryMovementRepository } = createHarness();

  await useCase.execute(validInput());

  assert.equal(inventoryMovementRepository.calls.length, 0);
});

test('repositories receive the generated product and inventory association', async () => {
  const { useCase, productRepository, inventoryStateRepository } =
    createHarness({
      ids: ['product-generated-456'],
    });

  await useCase.execute(validInput({ inventoryId: 'inventory-456' }));

  assert.equal(productRepository.calls[0]?.id, 'product-generated-456');
  assert.equal(inventoryStateRepository.calls[0]?.inventoryId, 'inventory-456');
  assert.equal(
    inventoryStateRepository.calls[0]?.productId,
    'product-generated-456',
  );
  assert.deepEqual(inventoryStateRepository.calls[0]?.state, {
    stock: 0,
    unitCost: null,
  });
});

test('returned result contains the exact persisted product and inventory', async () => {
  const { useCase, productRepository, inventoryStateRepository } =
    createHarness();

  const result = await useCase.execute(validInput());

  assert.strictEqual(result.product, productRepository.calls[0]);
  assert.strictEqual(
    result.inventory,
    inventoryStateRepository.calls[0]?.state,
  );
  assert.equal(result.initialMovement, null);
});

test('positive-stock creation saves all three records once', async () => {
  const {
    useCase,
    transactionManager,
    productRepository,
    inventoryStateRepository,
    inventoryMovementRepository,
  } = createHarness();

  await useCase.execute(
    validInput({
      initialStock: 20,
      initialUnitCost: Money.fromDecimal('0.9'),
    }),
  );

  assert.equal(transactionManager.calls, 1);
  assert.equal(productRepository.calls.length, 1);
  assert.equal(inventoryStateRepository.calls.length, 1);
  assert.equal(inventoryMovementRepository.calls.length, 1);
});

test('movement repository receives the inventory association and exact movement', async () => {
  const { useCase, inventoryMovementRepository } = createHarness();
  const initialUnitCost = Money.fromDecimal('0.900001');

  const result = await useCase.execute(
    validInput({
      inventoryId: 'inventory-789',
      initialStock: 20,
      initialUnitCost,
    }),
  );

  const persisted = inventoryMovementRepository.calls[0];
  assert.equal(persisted?.inventoryId, 'inventory-789');
  assert.equal(persisted?.productId, 'product-123');
  assert.equal(persisted?.id, 'movement-123');
  assert.equal(persisted?.type, 'INITIAL_STOCK');
  assert.equal(persisted?.quantityDelta, 20);
  assert.strictEqual(persisted?.unitCostSnapshot, initialUnitCost);
  assert.strictEqual(result.initialMovement, persisted);
});

test('all repository writes execute inside the transaction callback', async () => {
  const {
    useCase,
    productRepository,
    inventoryStateRepository,
    inventoryMovementRepository,
  } = createHarness();

  await useCase.execute(
    validInput({
      initialStock: 1,
      initialUnitCost: Money.fromDecimal('1'),
    }),
  );

  assert.deepEqual(productRepository.transactionStates, [true]);
  assert.deepEqual(inventoryStateRepository.transactionStates, [true]);
  assert.deepEqual(inventoryMovementRepository.transactionStates, [true]);
});

test('repository writes use Product then InventoryState then Movement order', async () => {
  const { useCase, events } = createHarness();

  await useCase.execute(
    validInput({
      initialStock: 1,
      initialUnitCost: Money.fromDecimal('1'),
    }),
  );

  assert.deepEqual(events, [
    'transaction:start',
    'product',
    'inventory',
    'movement',
    'transaction:complete',
  ]);
});

test('execute resolves only after the transaction manager completes', async () => {
  let releaseTransaction: (() => void) | undefined;
  let signalOperationComplete: (() => void) | undefined;
  const transactionGate = new Promise<void>((resolve) => {
    releaseTransaction = resolve;
  });
  const operationComplete = new Promise<void>((resolve) => {
    signalOperationComplete = resolve;
  });
  const productIdGenerator = new FakeProductIdGenerator(['product-123']);
  const productRepository: ProductRepository = {
    async listByInventory() {
      return [];
    },
    async save() {},
  };
  const inventoryStateRepository: InventoryStateRepository = {
    async listByInventory() {
      return [];
    },
    async save() {},
    async update() {},
  };
  const inventoryMovementRepository: InventoryMovementRepository = {
    async save() {},
  };
  const repositories: TransactionRepositories = {
    productRepository,
    inventoryStateRepository,
    inventoryMovementRepository,
    purchaseRepository: { async save() {} },
    saleRepository: { async save() {} },
    saleItemRepository: { async save() {} },
    stockAdjustmentRepository: { async save() {} },
    saleVoidRepository: unusedSaleVoidRepository,
    purchaseVoidRepository: unusedPurchaseVoidRepository,
  };
  const transactionManager: TransactionManager = {
    async runInTransaction(operation) {
      const result = await operation(repositories);
      signalOperationComplete?.();
      await transactionGate;
      return result;
    },
  };
  const useCase = new CreateProductUseCase({
    productIdGenerator,
    inventoryMovementIdGenerator: new FakeInventoryMovementIdGenerator([
      'movement-123',
    ]),
    clock: new FakeClock(1_776_444_000_000),
    transactionManager,
  });
  let resolved = false;

  const execution = useCase.execute(validInput()).then((result) => {
    resolved = true;
    return result;
  });
  await operationComplete;

  assert.equal(resolved, false);
  releaseTransaction?.();
  await execution;
  assert.equal(resolved, true);
});

test('repository writes are awaited sequentially', async () => {
  let releaseProduct: (() => void) | undefined;
  let signalProductStarted: (() => void) | undefined;
  const productGate = new Promise<void>((resolve) => {
    releaseProduct = resolve;
  });
  const productStarted = new Promise<void>((resolve) => {
    signalProductStarted = resolve;
  });
  let inventoryCalls = 0;
  const productRepository: ProductRepository = {
    async listByInventory() {
      return [];
    },
    async save() {
      signalProductStarted?.();
      await productGate;
    },
  };
  const inventoryStateRepository: InventoryStateRepository = {
    async listByInventory() {
      return [];
    },
    async save() {
      inventoryCalls += 1;
    },
    async update() {},
  };
  const repositories: TransactionRepositories = {
    productRepository,
    inventoryStateRepository,
    inventoryMovementRepository: { async save() {} },
    purchaseRepository: { async save() {} },
    saleRepository: { async save() {} },
    saleItemRepository: { async save() {} },
    stockAdjustmentRepository: { async save() {} },
    saleVoidRepository: unusedSaleVoidRepository,
    purchaseVoidRepository: unusedPurchaseVoidRepository,
  };
  const useCase = new CreateProductUseCase({
    productIdGenerator: new FakeProductIdGenerator(['product-123']),
    inventoryMovementIdGenerator: new FakeInventoryMovementIdGenerator([
      'movement-123',
    ]),
    clock: new FakeClock(1_776_444_000_000),
    transactionManager: {
      runInTransaction: (operation) => operation(repositories),
    },
  });

  const execution = useCase.execute(validInput());
  await productStarted;

  assert.equal(inventoryCalls, 0);
  releaseProduct?.();
  await execution;
  assert.equal(inventoryCalls, 1);
});

async function assertDomainFailureHasNoPersistence(
  input: CreateProductInput,
  expectedError: RegExp,
): Promise<void> {
  const {
    useCase,
    transactionManager,
    productRepository,
    inventoryStateRepository,
    inventoryMovementRepository,
  } = createHarness();

  await assert.rejects(() => useCase.execute(input), expectedError);
  assert.equal(transactionManager.calls, 0);
  assert.equal(productRepository.calls.length, 0);
  assert.equal(inventoryStateRepository.calls.length, 0);
  assert.equal(inventoryMovementRepository.calls.length, 0);
}

test('invalid name fails before transaction or repositories', async () => {
  await assertDomainFailureHasNoPersistence(
    validInput({ name: '   ' }),
    /product name.*empty/i,
  );
});

test('negative price fails before transaction or repositories', async () => {
  await assertDomainFailureHasNoPersistence(
    validInput({ regularSalePrice: Money.fromDecimal('-0.000001') }),
    /regular sale price.*negative/i,
  );
});

test('negative initial stock fails before transaction or repositories', async () => {
  await assertDomainFailureHasNoPersistence(
    validInput({
      initialStock: -1,
      initialUnitCost: Money.fromDecimal('1'),
    }),
    /initial stock.*negative/i,
  );
});

test('positive stock without cost fails before transaction or repositories', async () => {
  await assertDomainFailureHasNoPersistence(
    validInput({ initialStock: 1 }),
    /initial unit cost.*required.*positive/i,
  );
});

test('zero stock with cost fails before transaction or repositories', async () => {
  await assertDomainFailureHasNoPersistence(
    validInput({ initialUnitCost: Money.fromDecimal('1') }),
    /initial unit cost.*stock is zero/i,
  );
});

test('product repository failure is propagated without later writes', async () => {
  const error = new Error('product save failed');
  const { useCase, productRepository, inventoryStateRepository } =
    createHarness({
      productError: error,
    });

  await assert.rejects(() => useCase.execute(validInput()), error);
  assert.equal(productRepository.calls.length, 1);
  assert.equal(inventoryStateRepository.calls.length, 0);
});

test('inventory state repository failure is propagated without movement write', async () => {
  const error = new Error('inventory save failed');
  const { useCase, inventoryStateRepository, inventoryMovementRepository } =
    createHarness({ inventoryError: error });

  await assert.rejects(
    () =>
      useCase.execute(
        validInput({
          initialStock: 1,
          initialUnitCost: Money.fromDecimal('1'),
        }),
      ),
    error,
  );
  assert.equal(inventoryStateRepository.calls.length, 1);
  assert.equal(inventoryMovementRepository.calls.length, 0);
});

test('movement repository failure is propagated', async () => {
  const error = new Error('movement save failed');
  const { useCase, inventoryMovementRepository } = createHarness({
    movementError: error,
  });

  await assert.rejects(
    () =>
      useCase.execute(
        validInput({
          initialStock: 1,
          initialUnitCost: Money.fromDecimal('1'),
        }),
      ),
    error,
  );
  assert.equal(inventoryMovementRepository.calls.length, 1);
});

test('transaction manager failure is propagated without repository calls', async () => {
  const error = new Error('transaction failed');
  const {
    useCase,
    productRepository,
    inventoryStateRepository,
    inventoryMovementRepository,
  } = createHarness({ transactionError: error });

  await assert.rejects(() => useCase.execute(validInput()), error);
  assert.equal(productRepository.calls.length, 0);
  assert.equal(inventoryStateRepository.calls.length, 0);
  assert.equal(inventoryMovementRepository.calls.length, 0);
});

test('persistence failures are not retried and return no result', async () => {
  const error = new Error('product save failed');
  const { useCase, transactionManager, productRepository } = createHarness({
    productError: error,
  });
  let returned = false;

  try {
    await useCase.execute(validInput());
    returned = true;
  } catch (caught) {
    assert.strictEqual(caught, error);
  }

  assert.equal(returned, false);
  assert.equal(transactionManager.calls, 1);
  assert.equal(productRepository.calls.length, 1);
});

test('two executions use independent IDs and persistence calls', async () => {
  const {
    useCase,
    productIdGenerator,
    transactionManager,
    productRepository,
    inventoryStateRepository,
  } = createHarness({ ids: ['product-1', 'product-2'] });

  const first = await useCase.execute(validInput());
  const second = await useCase.execute(validInput());

  assert.equal(first.product.id, 'product-1');
  assert.equal(second.product.id, 'product-2');
  assert.equal(productIdGenerator.calls, 2);
  assert.equal(transactionManager.calls, 2);
  assert.equal(productRepository.calls.length, 2);
  assert.equal(inventoryStateRepository.calls.length, 2);
});

test('Money inputs remain unchanged through persistence', async () => {
  const { useCase } = createHarness();
  const regularSalePrice = Money.fromDecimal('1.250001');
  const initialUnitCost = Money.fromDecimal('0.900001');

  await useCase.execute(
    validInput({
      regularSalePrice,
      initialStock: 2,
      initialUnitCost,
    }),
  );

  assert.equal(regularSalePrice.scaledUnits, 1_250_001);
  assert.equal(initialUnitCost.scaledUnits, 900_001);
});

test('repository input types reuse Domain models', () => {
  const state: InventoryState = { stock: 0, unitCost: null };
  const movement: InventoryMovement = {
    id: 'movement-123',
    inventoryId: 'inventory-123',
    productId: 'product-123',
    type: 'INITIAL_STOCK',
    quantityDelta: 1,
    effectiveAt: 1_776_444_000_000,
    createdAt: 1_776_444_000_000,
    updatedAt: 1_776_444_000_000,
    sourceType: null,
    sourceId: null,
    unitCostSnapshot: Money.fromDecimal('1'),
    stockBefore: 0,
    stockAfter: 1,
    metadata: null,
  };
  const inventoryInput: SaveInventoryStateInput = {
    inventoryId: 'inventory-123',
    productId: 'product-123',
    state,
  };
  assert.strictEqual(inventoryInput.state, state);
  assert.equal(movement.inventoryId, inventoryInput.inventoryId);
  assert.equal(movement.productId, inventoryInput.productId);
});
