import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInventoryState,
  createProduct,
  Money,
  type InventoryState,
  type Product,
} from '@stock-app/domain';

import {
  ListProductsUseCase,
  type InventoryStateRecord,
  type InventoryStateRepository,
  type ProductRepository,
} from '../src/index';

const INVENTORY_ID = 'inventory-123';

function product(id: string, overrides: Partial<Product> = {}): Product {
  return {
    ...createProduct({
      id,
      inventoryId: INVENTORY_ID,
      name: `Product ${id}`,
      regularSalePrice: Money.fromDecimal('1.25'),
      createdAt: 100,
      updatedAt: 100,
    }),
    ...overrides,
  };
}

function state(
  productId: string,
  inventoryState: InventoryState = createInventoryState({
    stock: 0,
    unitCost: null,
  }),
): InventoryStateRecord {
  return {
    inventoryId: INVENTORY_ID,
    productId,
    state: inventoryState,
  };
}

class StubProductRepository implements ProductRepository {
  listCalls: string[] = [];

  constructor(
    readonly products: readonly Product[],
    private readonly listError: Error | null = null,
  ) {}

  async listByInventory(inventoryId: string): Promise<readonly Product[]> {
    this.listCalls.push(inventoryId);

    if (this.listError !== null) {
      throw this.listError;
    }

    return this.products;
  }

  async save(): Promise<void> {}
}

class StubInventoryStateRepository implements InventoryStateRepository {
  listCalls: string[] = [];

  constructor(
    readonly states: readonly InventoryStateRecord[],
    private readonly listError: Error | null = null,
  ) {}

  async listByInventory(
    inventoryId: string,
  ): Promise<readonly InventoryStateRecord[]> {
    this.listCalls.push(inventoryId);

    if (this.listError !== null) {
      throw this.listError;
    }

    return this.states;
  }

  async save(): Promise<void> {}

  async update(): Promise<void> {}
}

function createUseCase(
  products: readonly Product[],
  states: readonly InventoryStateRecord[],
): {
  readonly productRepository: StubProductRepository;
  readonly inventoryStateRepository: StubInventoryStateRepository;
  readonly useCase: ListProductsUseCase;
} {
  const productRepository = new StubProductRepository(products);
  const inventoryStateRepository = new StubInventoryStateRepository(states);

  return {
    productRepository,
    inventoryStateRepository,
    useCase: new ListProductsUseCase({
      productRepository,
      inventoryStateRepository,
    }),
  };
}

test('returns an empty list for an inventory without products', async () => {
  const { useCase } = createUseCase([], []);

  assert.deepEqual(await useCase.execute({ inventoryId: INVENTORY_ID }), []);
});

test('returns one product with its inventory state', async () => {
  const existingProduct = product('product-1');
  const existingState = state(
    existingProduct.id,
    createInventoryState({
      stock: 10,
      unitCost: Money.fromDecimal('0.70'),
    }),
  );
  const { useCase } = createUseCase([existingProduct], [existingState]);

  const result = await useCase.execute({ inventoryId: INVENTORY_ID });

  assert.deepEqual(result, [
    { product: existingProduct, state: existingState.state },
  ]);
});

test('matches multiple states with the correct products', async () => {
  const firstProduct = product('product-1');
  const secondProduct = product('product-2');
  const firstState = state(
    firstProduct.id,
    createInventoryState({ stock: 3, unitCost: Money.fromDecimal('0.5') }),
  );
  const secondState = state(
    secondProduct.id,
    createInventoryState({ stock: 8, unitCost: Money.fromDecimal('0.9') }),
  );
  const { useCase } = createUseCase(
    [firstProduct, secondProduct],
    [secondState, firstState],
  );

  const result = await useCase.execute({ inventoryId: INVENTORY_ID });

  assert.equal(result[0]?.product.id, secondProduct.id);
  assert.equal(result[0]?.state.stock, 8);
  assert.equal(result[1]?.product.id, firstProduct.id);
  assert.equal(result[1]?.state.stock, 3);
});

test('excludes archived products from the normal list', async () => {
  const activeProduct = product('product-active');
  const archivedProduct = product('product-archived', { isArchived: true });
  const { useCase } = createUseCase(
    [activeProduct, archivedProduct],
    [state(activeProduct.id), state(archivedProduct.id)],
  );

  const result = await useCase.execute({ inventoryId: INVENTORY_ID });

  assert.deepEqual(
    result.map(({ product: listedProduct }) => listedProduct.id),
    [activeProduct.id],
  );
});

test('preserves negative current stock', async () => {
  const existingProduct = product('product-negative');
  const { useCase } = createUseCase(
    [existingProduct],
    [
      state(
        existingProduct.id,
        createInventoryState({
          stock: -4,
          unitCost: Money.fromDecimal('0.70'),
        }),
      ),
    ],
  );

  const result = await useCase.execute({ inventoryId: INVENTORY_ID });

  assert.equal(result[0]?.state.stock, -4);
});

test('preserves an unknown current cost as null', async () => {
  const existingProduct = product('product-unknown-cost');
  const { useCase } = createUseCase(
    [existingProduct],
    [state(existingProduct.id)],
  );

  const result = await useCase.execute({ inventoryId: INVENTORY_ID });

  assert.equal(result[0]?.state.unitCost, null);
});

test('preserves a known zero current cost', async () => {
  const existingProduct = product('product-zero-cost');
  const { useCase } = createUseCase(
    [existingProduct],
    [
      state(
        existingProduct.id,
        createInventoryState({ stock: 1, unitCost: Money.zero() }),
      ),
    ],
  );

  const result = await useCase.execute({ inventoryId: INVENTORY_ID });

  assert.equal(result[0]?.state.unitCost?.scaledUnits, 0);
});

test('orders newest products first with a deterministic ID tie-breaker', async () => {
  const older = product('product-z', { createdAt: 100, updatedAt: 100 });
  const newerA = product('product-a', { createdAt: 200, updatedAt: 200 });
  const newerB = product('product-b', { createdAt: 200, updatedAt: 200 });
  const { useCase } = createUseCase(
    [older, newerA, newerB],
    [state(older.id), state(newerA.id), state(newerB.id)],
  );

  const result = await useCase.execute({ inventoryId: INVENTORY_ID });

  assert.deepEqual(
    result.map(({ product: listedProduct }) => listedProduct.id),
    ['product-b', 'product-a', 'product-z'],
  );
});

test('queries both repositories with the requested inventory ID', async () => {
  const { useCase, productRepository, inventoryStateRepository } =
    createUseCase([], []);

  await useCase.execute({ inventoryId: 'inventory-requested' });

  assert.deepEqual(productRepository.listCalls, ['inventory-requested']);
  assert.deepEqual(inventoryStateRepository.listCalls, ['inventory-requested']);
});

test('propagates ProductRepository failures', async () => {
  const error = new Error('product read failed');
  const productRepository = new StubProductRepository([], error);
  const inventoryStateRepository = new StubInventoryStateRepository([]);
  const useCase = new ListProductsUseCase({
    productRepository,
    inventoryStateRepository,
  });

  await assert.rejects(
    () => useCase.execute({ inventoryId: INVENTORY_ID }),
    error,
  );
});

test('propagates InventoryStateRepository failures', async () => {
  const error = new Error('inventory state read failed');
  const productRepository = new StubProductRepository([]);
  const inventoryStateRepository = new StubInventoryStateRepository([], error);
  const useCase = new ListProductsUseCase({
    productRepository,
    inventoryStateRepository,
  });

  await assert.rejects(
    () => useCase.execute({ inventoryId: INVENTORY_ID }),
    error,
  );
});
