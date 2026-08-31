import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FindProductByBarcodeUseCase,
  type ProductBarcodeReader,
} from '../src/index';
import { createProduct, Money, type Product } from '@stock-app/domain';

const TIMESTAMP = 1_776_444_000_000;

function product(
  overrides: Partial<{
    readonly id: string;
    readonly inventoryId: string;
    readonly barcode: string | null;
    readonly isArchived: boolean;
  }> = {},
): Product {
  const created = createProduct({
    id: overrides.id ?? 'product-123',
    inventoryId: overrides.inventoryId ?? 'inventory-123',
    name: 'Coca-Cola',
    barcode: overrides.barcode === undefined ? '0012345' : overrides.barcode,
    regularSalePrice: Money.fromDecimal('1'),
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  });

  return Object.freeze({
    ...created,
    isArchived: overrides.isArchived ?? false,
  });
}

class RecordingProductBarcodeReader implements ProductBarcodeReader {
  readonly calls: { inventoryId: string; barcode: string }[] = [];

  constructor(
    private readonly result: Product | null,
    private readonly failure: Error | null = null,
  ) {}

  async findActiveByBarcode(
    inventoryId: string,
    barcode: string,
  ): Promise<Product | null> {
    this.calls.push({ inventoryId, barcode });
    if (this.failure !== null) throw this.failure;
    return this.result;
  }
}

test('finds an active Product by exact barcode and returns only its ID', async () => {
  const reader = new RecordingProductBarcodeReader(product());
  const useCase = new FindProductByBarcodeUseCase(reader);

  const result = await useCase.execute({
    inventoryId: 'inventory-123',
    barcode: '0012345',
  });

  assert.deepEqual(result, { productId: 'product-123' });
  assert.deepEqual(reader.calls, [
    { inventoryId: 'inventory-123', barcode: '0012345' },
  ]);
});

test('trims scanner whitespace without removing leading zeroes', async () => {
  const reader = new RecordingProductBarcodeReader(product());
  const useCase = new FindProductByBarcodeUseCase(reader);

  await useCase.execute({
    inventoryId: 'inventory-123',
    barcode: '  0012345  ',
  });

  assert.deepEqual(reader.calls, [
    { inventoryId: 'inventory-123', barcode: '0012345' },
  ]);
});

test('an empty barcode does not query persistence', async () => {
  const reader = new RecordingProductBarcodeReader(product());
  const useCase = new FindProductByBarcodeUseCase(reader);

  assert.equal(
    await useCase.execute({ inventoryId: 'inventory-123', barcode: '   ' }),
    null,
  );
  assert.deepEqual(reader.calls, []);
});

test('returns null when no active Product has the exact barcode', async () => {
  const reader = new RecordingProductBarcodeReader(null);
  const useCase = new FindProductByBarcodeUseCase(reader);

  assert.equal(
    await useCase.execute({
      inventoryId: 'inventory-123',
      barcode: '0012345',
    }),
    null,
  );
});

test('does not expose a Product from another Inventory', async () => {
  const reader = new RecordingProductBarcodeReader(
    product({ inventoryId: 'inventory-other' }),
  );
  const useCase = new FindProductByBarcodeUseCase(reader);

  assert.equal(
    await useCase.execute({
      inventoryId: 'inventory-123',
      barcode: '0012345',
    }),
    null,
  );
});

test('does not expose an archived Product', async () => {
  const reader = new RecordingProductBarcodeReader(
    product({ isArchived: true }),
  );
  const useCase = new FindProductByBarcodeUseCase(reader);

  assert.equal(
    await useCase.execute({
      inventoryId: 'inventory-123',
      barcode: '0012345',
    }),
    null,
  );
});

test('does not accept a non-exact barcode returned by persistence', async () => {
  const reader = new RecordingProductBarcodeReader(
    product({ barcode: '00123456' }),
  );
  const useCase = new FindProductByBarcodeUseCase(reader);

  assert.equal(
    await useCase.execute({
      inventoryId: 'inventory-123',
      barcode: '0012345',
    }),
    null,
  );
});

test('propagates local lookup failures unchanged', async () => {
  const failure = new Error('database unavailable');
  const useCase = new FindProductByBarcodeUseCase(
    new RecordingProductBarcodeReader(null, failure),
  );

  await assert.rejects(
    () =>
      useCase.execute({
        inventoryId: 'inventory-123',
        barcode: '0012345',
      }),
    (error) => error === failure,
  );
});
