import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInventoryState,
  createProduct,
  Money,
  Percentage,
  type InventoryState,
  type Product,
} from '@stock-app/domain';

import {
  GetProductDetailsUseCase,
  type InventoryStateRecord,
  type InventoryStateRepository,
  type ProductRepository,
} from '../src/index';

const INVENTORY_ID = 'inventory-123';

function product(overrides: Partial<Product> = {}): Product {
  return {
    ...createProduct({
      id: 'product-123',
      inventoryId: INVENTORY_ID,
      name: 'Coca-Cola',
      variant: '500 ml',
      barcode: '0012345',
      regularSalePrice: Money.fromDecimal('1.50'),
      minimumStock: 2,
      createdAt: 100,
      updatedAt: 100,
    }),
    ...overrides,
  };
}

function state(
  productId = 'product-123',
  inventoryState: InventoryState = createInventoryState({
    stock: 12,
    unitCost: Money.fromDecimal('1.00'),
  }),
): InventoryStateRecord {
  return { inventoryId: INVENTORY_ID, productId, state: inventoryState };
}

class StubProductRepository implements ProductRepository {
  readonly listCalls: string[] = [];

  constructor(
    private readonly products: readonly Product[],
    private readonly error: Error | null = null,
  ) {}

  async listByInventory(inventoryId: string): Promise<readonly Product[]> {
    this.listCalls.push(inventoryId);

    if (this.error !== null) throw this.error;
    return this.products;
  }

  async save(): Promise<void> {}
}

class StubInventoryStateRepository implements InventoryStateRepository {
  readonly listCalls: string[] = [];

  constructor(
    private readonly states: readonly InventoryStateRecord[],
    private readonly error: Error | null = null,
  ) {}

  async listByInventory(
    inventoryId: string,
  ): Promise<readonly InventoryStateRecord[]> {
    this.listCalls.push(inventoryId);

    if (this.error !== null) throw this.error;
    return this.states;
  }

  async save(): Promise<void> {}
  async update(): Promise<void> {}
}

function createUseCase(
  products: readonly Product[] = [product()],
  states: readonly InventoryStateRecord[] = [state()],
) {
  const productRepository = new StubProductRepository(products);
  const inventoryStateRepository = new StubInventoryStateRepository(states);

  return {
    productRepository,
    inventoryStateRepository,
    useCase: new GetProductDetailsUseCase({
      productRepository,
      inventoryStateRepository,
    }),
  };
}

test('returns the current Product and InventoryState as a compact read model', async () => {
  const { useCase } = createUseCase();

  const details = await useCase.execute({
    inventoryId: INVENTORY_ID,
    productId: 'product-123',
  });

  assert.equal(details?.id, 'product-123');
  assert.equal(details?.name, 'Coca-Cola');
  assert.equal(details?.variant, '500 ml');
  assert.equal(details?.barcode, '0012345');
  assert.equal(details?.minimumStock, 2);
  assert.equal(details?.stock, 12);
  assert.equal(details?.unitCost?.scaledUnits, 1_000_000);
  assert.equal(details?.regularSalePrice.scaledUnits, 1_500_000);
});

test('calculates current unit profitability using Domain values', async () => {
  const { useCase } = createUseCase();

  const details = await useCase.execute({
    inventoryId: INVENTORY_ID,
    productId: 'product-123',
  });

  assert.equal(details?.estimatedUnitProfit?.scaledUnits, 500_000);
  assert.ok(details?.margin?.equals(Percentage.fromScaledUnits(33_333_333)));
  assert.ok(details?.markup?.equals(Percentage.fromScaledUnits(50_000_000)));
});

for (const stock of [4, 0, -3]) {
  test(`preserves current stock ${stock}`, async () => {
    const currentState = state(
      'product-123',
      createInventoryState({
        stock,
        unitCost: Money.fromDecimal('1.00'),
      }),
    );
    const { useCase } = createUseCase([product()], [currentState]);

    const details = await useCase.execute({
      inventoryId: INVENTORY_ID,
      productId: 'product-123',
    });

    assert.equal(details?.stock, stock);
  });
}

test('keeps all profitability values unavailable when current cost is unknown', async () => {
  const unknownCostState = state(
    'product-123',
    createInventoryState({ stock: 0, unitCost: null }),
  );
  const { useCase } = createUseCase([product()], [unknownCostState]);

  const details = await useCase.execute({
    inventoryId: INVENTORY_ID,
    productId: 'product-123',
  });

  assert.equal(details?.unitCost, null);
  assert.equal(details?.estimatedUnitProfit, null);
  assert.equal(details?.margin, null);
  assert.equal(details?.markup, null);
});

test('preserves known zero cost without inventing markup', async () => {
  const zeroCostState = state(
    'product-123',
    createInventoryState({ stock: 1, unitCost: Money.zero() }),
  );
  const { useCase } = createUseCase([product()], [zeroCostState]);

  const details = await useCase.execute({
    inventoryId: INVENTORY_ID,
    productId: 'product-123',
  });

  assert.equal(details?.unitCost?.scaledUnits, 0);
  assert.equal(details?.estimatedUnitProfit?.scaledUnits, 1_500_000);
  assert.equal(details?.margin?.scaledUnits, 100_000_000);
  assert.equal(details?.markup, null);
});

test('preserves a known zero sale price and returns no margin', async () => {
  const zeroPriceProduct = product({ regularSalePrice: Money.zero() });
  const { useCase } = createUseCase([zeroPriceProduct], [state()]);

  const details = await useCase.execute({
    inventoryId: INVENTORY_ID,
    productId: 'product-123',
  });

  assert.equal(details?.regularSalePrice.scaledUnits, 0);
  assert.equal(details?.estimatedUnitProfit?.scaledUnits, -1_000_000);
  assert.equal(details?.margin, null);
  assert.equal(details?.markup?.scaledUnits, -100_000_000);
});

test('returns unavailable instead of an unsafe or infinite markup', async () => {
  const largePriceProduct = product({
    regularSalePrice: Money.fromScaledUnits(Number.MAX_SAFE_INTEGER),
  });
  const tinyCostState = state(
    'product-123',
    createInventoryState({
      stock: 1,
      unitCost: Money.fromScaledUnits(1),
    }),
  );
  const { useCase } = createUseCase([largePriceProduct], [tinyCostState]);

  const details = await useCase.execute({
    inventoryId: INVENTORY_ID,
    productId: 'product-123',
  });

  assert.equal(details?.markup, null);
  assert.equal(details?.margin?.scaledUnits, 100_000_000);
});

test('returns unavailable instead of an unsafe or infinite margin', async () => {
  const tinyPriceProduct = product({
    regularSalePrice: Money.fromScaledUnits(1),
  });
  const largeCostState = state(
    'product-123',
    createInventoryState({
      stock: 1,
      unitCost: Money.fromScaledUnits(Number.MAX_SAFE_INTEGER),
    }),
  );
  const { useCase } = createUseCase([tinyPriceProduct], [largeCostState]);

  const details = await useCase.execute({
    inventoryId: INVENTORY_ID,
    productId: 'product-123',
  });

  assert.equal(details?.margin, null);
  assert.equal(details?.markup?.scaledUnits, -100_000_000);
});

test('returns null for a missing product', async () => {
  const { useCase } = createUseCase([], []);

  assert.equal(
    await useCase.execute({
      inventoryId: INVENTORY_ID,
      productId: 'missing-product',
    }),
    null,
  );
});

test('returns null for an archived product reached by deep link', async () => {
  const archivedProduct = product({ isArchived: true });
  const { useCase } = createUseCase([archivedProduct], [state()]);

  assert.equal(
    await useCase.execute({
      inventoryId: INVENTORY_ID,
      productId: archivedProduct.id,
    }),
    null,
  );
});

test('returns null when the requested product belongs to another inventory', async () => {
  const foreignProduct = product({ inventoryId: 'inventory-other' });
  const { useCase } = createUseCase([foreignProduct], [state()]);

  assert.equal(
    await useCase.execute({
      inventoryId: INVENTORY_ID,
      productId: foreignProduct.id,
    }),
    null,
  );
});

test('fails explicitly when an existing product has no InventoryState', async () => {
  const { useCase } = createUseCase([product()], []);

  await assert.rejects(
    () =>
      useCase.execute({
        inventoryId: INVENTORY_ID,
        productId: 'product-123',
      }),
    /inventory state is missing/i,
  );
});

test('queries both read repositories with the current inventory ID', async () => {
  const { useCase, productRepository, inventoryStateRepository } =
    createUseCase();

  await useCase.execute({
    inventoryId: INVENTORY_ID,
    productId: 'product-123',
  });

  assert.deepEqual(productRepository.listCalls, [INVENTORY_ID]);
  assert.deepEqual(inventoryStateRepository.listCalls, [INVENTORY_ID]);
});

test('propagates read failures without converting them to not found', async () => {
  const error = new Error('product read failed');
  const productRepository = new StubProductRepository([], error);
  const useCase = new GetProductDetailsUseCase({
    productRepository,
    inventoryStateRepository: new StubInventoryStateRepository([]),
  });

  await assert.rejects(
    () =>
      useCase.execute({
        inventoryId: INVENTORY_ID,
        productId: 'product-123',
      }),
    error,
  );
});
