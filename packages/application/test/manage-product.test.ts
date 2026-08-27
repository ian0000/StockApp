import assert from 'node:assert/strict';
import test from 'node:test';

import { createProduct, Money, type Product } from '@stock-app/domain';

import {
  ArchiveProductUseCase,
  ProductManagementUnavailableError,
  UpdateProductUseCase,
  type ProductManagementRepository,
  type UpdateProductInput,
} from '../src/index';

const INVENTORY_ID = 'inventory-123';

function product(overrides: Partial<Product> = {}): Product {
  return Object.freeze({
    ...createProduct({
      id: 'product-123',
      inventoryId: INVENTORY_ID,
      name: 'Coca-Cola',
      variant: '500 ml',
      barcode: '0012345',
      regularSalePrice: Money.fromDecimal('1.00'),
      minimumStock: 2,
      createdAt: 100,
      updatedAt: 100,
    }),
    ...overrides,
  });
}

class StubProductManagementRepository implements ProductManagementRepository {
  readonly findCalls: { inventoryId: string; productId: string }[] = [];
  readonly updates: Product[] = [];

  constructor(
    private readonly storedProduct: Product | null,
    private readonly findError: Error | null = null,
    private readonly updateError: Error | null = null,
  ) {}

  async findById(
    inventoryId: string,
    productId: string,
  ): Promise<Product | null> {
    this.findCalls.push({ inventoryId, productId });

    if (this.findError !== null) throw this.findError;
    if (
      this.storedProduct === null ||
      this.storedProduct.inventoryId !== inventoryId ||
      this.storedProduct.id !== productId
    ) {
      return null;
    }

    return this.storedProduct;
  }

  async update(updatedProduct: Product): Promise<void> {
    if (this.updateError !== null) throw this.updateError;
    this.updates.push(updatedProduct);
  }
}

function validUpdate(
  overrides: Partial<UpdateProductInput> = {},
): UpdateProductInput {
  return {
    inventoryId: INVENTORY_ID,
    productId: 'product-123',
    name: 'Coca-Cola Zero',
    variant: '600 ml',
    barcode: '0009876',
    regularSalePrice: Money.fromDecimal('1.250001'),
    minimumStock: 4,
    ...overrides,
  };
}

test('UpdateProduct updates the existing Product and preserves identity', async () => {
  const repository = new StubProductManagementRepository(product());
  const useCase = new UpdateProductUseCase({
    clock: { now: () => 200 },
    productRepository: repository,
  });

  const updated = await useCase.execute(validUpdate());

  assert.deepEqual(repository.findCalls, [
    { inventoryId: INVENTORY_ID, productId: 'product-123' },
  ]);
  assert.equal(repository.updates.length, 1);
  assert.equal(repository.updates[0], updated);
  assert.equal(updated.id, 'product-123');
  assert.equal(updated.inventoryId, INVENTORY_ID);
  assert.equal(updated.createdAt, 100);
  assert.equal(updated.updatedAt, 200);
  assert.equal(updated.name, 'Coca-Cola Zero');
  assert.equal(updated.regularSalePrice.scaledUnits, 1_250_001);
});

test('UpdateProduct updates and removes every approved optional field', async () => {
  const repository = new StubProductManagementRepository(product());
  const useCase = new UpdateProductUseCase({
    clock: { now: () => 200 },
    productRepository: repository,
  });

  const updated = await useCase.execute(
    validUpdate({
      variant: null,
      barcode: null,
      regularSalePrice: Money.zero(),
      minimumStock: null,
    }),
  );

  assert.equal(updated.variant, null);
  assert.equal(updated.barcode, null);
  assert.equal(updated.regularSalePrice.scaledUnits, 0);
  assert.equal(updated.minimumStock, null);
});

test('UpdateProduct propagates the same Domain validation used by creation', async () => {
  const repository = new StubProductManagementRepository(product());
  const useCase = new UpdateProductUseCase({
    clock: { now: () => 200 },
    productRepository: repository,
  });

  await assert.rejects(
    () => useCase.execute(validUpdate({ name: '   ' })),
    /product name.*empty/i,
  );
  assert.equal(repository.updates.length, 0);
});

for (const [label, storedProduct, input] of [
  ['missing', null, validUpdate()],
  [
    'another inventory',
    product({ inventoryId: 'inventory-other' }),
    validUpdate(),
  ],
  ['archived', product({ isArchived: true }), validUpdate()],
] as const) {
  test(`UpdateProduct rejects a ${label} Product without persistence`, async () => {
    const repository = new StubProductManagementRepository(storedProduct);
    const useCase = new UpdateProductUseCase({
      clock: { now: () => 200 },
      productRepository: repository,
    });

    await assert.rejects(
      () => useCase.execute(input),
      ProductManagementUnavailableError,
    );
    assert.equal(repository.updates.length, 0);
  });
}

test('UpdateProduct propagates repository failures unchanged', async () => {
  const error = new Error('update failed');
  const repository = new StubProductManagementRepository(
    product(),
    null,
    error,
  );
  const useCase = new UpdateProductUseCase({
    clock: { now: () => 200 },
    productRepository: repository,
  });

  await assert.rejects(
    () => useCase.execute(validUpdate()),
    (caught) => {
      return caught === error;
    },
  );
});

test('ArchiveProduct persists isArchived without changing Product fields', async () => {
  const original = product();
  const repository = new StubProductManagementRepository(original);
  const useCase = new ArchiveProductUseCase({
    clock: { now: () => 200 },
    productRepository: repository,
  });

  const archived = await useCase.execute({
    inventoryId: INVENTORY_ID,
    productId: original.id,
  });

  assert.equal(archived.isArchived, true);
  assert.equal(archived.id, original.id);
  assert.equal(archived.inventoryId, original.inventoryId);
  assert.equal(archived.name, original.name);
  assert.equal(archived.regularSalePrice, original.regularSalePrice);
  assert.equal(archived.createdAt, original.createdAt);
  assert.equal(archived.updatedAt, 200);
  assert.deepEqual(repository.updates, [archived]);
});

test('ArchiveProduct is idempotent for an already archived Product', async () => {
  const archived = product({ isArchived: true, updatedAt: 150 });
  const repository = new StubProductManagementRepository(archived);
  const useCase = new ArchiveProductUseCase({
    clock: { now: () => 200 },
    productRepository: repository,
  });

  const result = await useCase.execute({
    inventoryId: INVENTORY_ID,
    productId: archived.id,
  });

  assert.equal(result, archived);
  assert.deepEqual(repository.updates, []);
});

for (const [label, storedProduct] of [
  ['missing', null],
  ['another inventory', product({ inventoryId: 'inventory-other' })],
] as const) {
  test(`ArchiveProduct rejects a ${label} Product`, async () => {
    const repository = new StubProductManagementRepository(storedProduct);
    const useCase = new ArchiveProductUseCase({
      clock: { now: () => 200 },
      productRepository: repository,
    });

    await assert.rejects(
      () =>
        useCase.execute({
          inventoryId: INVENTORY_ID,
          productId: 'product-123',
        }),
      ProductManagementUnavailableError,
    );
    assert.deepEqual(repository.updates, []);
  });
}

test('ArchiveProduct propagates repository failures unchanged', async () => {
  const error = new Error('archive update failed');
  const repository = new StubProductManagementRepository(
    product(),
    null,
    error,
  );
  const useCase = new ArchiveProductUseCase({
    clock: { now: () => 200 },
    productRepository: repository,
  });

  await assert.rejects(
    () =>
      useCase.execute({
        inventoryId: INVENTORY_ID,
        productId: 'product-123',
      }),
    (caught) => caught === error,
  );
});

test('Product management has no InventoryState or historical-delete capability', () => {
  const repository = new StubProductManagementRepository(product());

  assert.equal('inventoryStateRepository' in repository, false);
  assert.equal('delete' in repository, false);
  assert.equal('deleteMovements' in repository, false);
  assert.equal('deleteSales' in repository, false);
  assert.equal('deletePurchases' in repository, false);
  assert.equal('deleteAdjustments' in repository, false);
});
