import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSale,
  createSaleItem,
  Money,
  type Sale,
  type SaleItem,
} from '@stock-app/domain';

import {
  GetSaleDetailsUseCase,
  type SaleDetailsReader,
  type SaleDetailsSource,
} from '../src/index';

const INVENTORY_ID = 'inventory-123';
const SALE_ID = 'sale-123';

function sale(overrides: Partial<Sale> = {}): Sale {
  return {
    ...createSale({
      id: SALE_ID,
      inventoryId: INVENTORY_ID,
      effectiveAt: 1_777_000_000_000,
      createdAt: 1_777_000_000_001,
      updatedAt: 1_777_000_000_001,
      status: 'CONFIRMED',
      totalAmount: Money.fromDecimal('3.25'),
      estimatedCost: Money.fromDecimal('2.10'),
      estimatedProfit: Money.fromDecimal('1.15'),
      notes: 'Cliente frecuente',
    }),
    ...overrides,
  };
}

function item(
  overrides: Partial<SaleItem> = {},
  productName: string | null = 'Coca-Cola',
  productVariant: string | null = '500 ml',
): SaleDetailsSource['items'][number] {
  return Object.freeze({
    item: {
      ...createSaleItem({
        id: 'sale-item-1',
        saleId: SALE_ID,
        productId: 'product-1',
        quantity: 2,
        unitSalePrice: Money.fromDecimal('1.00'),
        subtotal: Money.fromDecimal('2.00'),
        unitCostSnapshot: Money.fromDecimal('0.70'),
        estimatedCost: Money.fromDecimal('1.40'),
        estimatedProfit: Money.fromDecimal('0.60'),
        costStatus: 'KNOWN',
        createdAt: 1_777_000_000_001,
        updatedAt: 1_777_000_000_001,
      }),
      ...overrides,
    },
    productName,
    productVariant,
  });
}

class StubSaleDetailsReader implements SaleDetailsReader {
  readonly calls: { inventoryId: string; saleId: string }[] = [];

  constructor(
    private readonly source: SaleDetailsSource | null,
    private readonly error: Error | null = null,
  ) {}

  async findById(input: {
    inventoryId: string;
    saleId: string;
  }): Promise<SaleDetailsSource | null> {
    this.calls.push(input);
    if (this.error !== null) throw this.error;
    return this.source;
  }
}

function useCase(source: SaleDetailsSource | null) {
  const reader = new StubSaleDetailsReader(source);
  return { reader, useCase: new GetSaleDetailsUseCase(reader) };
}

test('returns one confirmed Sale with its exact historical line snapshots', async () => {
  const { reader, useCase: getSaleDetails } = useCase({
    sale: sale(),
    items: [item()],
  });

  const details = await getSaleDetails.execute({
    inventoryId: ` ${INVENTORY_ID} `,
    saleId: ` ${SALE_ID} `,
  });

  assert.deepEqual(reader.calls, [
    { inventoryId: INVENTORY_ID, saleId: SALE_ID },
  ]);
  assert.equal(details?.id, SALE_ID);
  assert.equal(details?.status, 'CONFIRMED');
  assert.equal(details?.totalAmount.scaledUnits, 3_250_000);
  assert.equal(details?.estimatedCost?.scaledUnits, 2_100_000);
  assert.equal(details?.estimatedProfit?.scaledUnits, 1_150_000);
  assert.equal(details?.totalUnits, 2);
  assert.equal(details?.items[0]?.productName, 'Coca-Cola');
  assert.equal(details?.items[0]?.productVariant, '500 ml');
  assert.equal(details?.items[0]?.unitSalePrice.scaledUnits, 1_000_000);
  assert.equal(details?.items[0]?.subtotal.scaledUnits, 2_000_000);
  assert.equal(details?.items[0]?.unitCostSnapshot?.scaledUnits, 700_000);
  assert.equal(details?.items[0]?.estimatedProfit?.scaledUnits, 600_000);
});

test('returns null when the Sale does not exist or belongs to another Inventory', async () => {
  const { useCase: getSaleDetails } = useCase(null);

  assert.equal(
    await getSaleDetails.execute({
      inventoryId: INVENTORY_ID,
      saleId: 'sale-from-another-inventory',
    }),
    null,
  );
});

test('returns every line of a multi-product Sale and sums units safely', async () => {
  const secondItem = item(
    {
      id: 'sale-item-2',
      productId: 'product-2',
      quantity: 1,
      unitSalePrice: Money.fromDecimal('1.25'),
      subtotal: Money.fromDecimal('1.25'),
      unitCostSnapshot: Money.fromDecimal('0.70'),
      estimatedCost: Money.fromDecimal('0.70'),
      estimatedProfit: Money.fromDecimal('0.55'),
    },
    'Doritos',
    null,
  );
  const { useCase: getSaleDetails } = useCase({
    sale: sale(),
    items: [item(), secondItem],
  });

  const details = await getSaleDetails.execute({
    inventoryId: INVENTORY_ID,
    saleId: SALE_ID,
  });

  assert.equal(details?.items.length, 2);
  assert.equal(details?.totalUnits, 3);
  assert.equal(details?.items[1]?.productName, 'Doritos');
  assert.equal(details?.items[1]?.productVariant, null);
});

test('preserves VOIDED status and all original monetary values', async () => {
  const { useCase: getSaleDetails } = useCase({
    sale: sale({ status: 'VOIDED' }),
    items: [item()],
  });

  const details = await getSaleDetails.execute({
    inventoryId: INVENTORY_ID,
    saleId: SALE_ID,
  });

  assert.equal(details?.status, 'VOIDED');
  assert.equal(details?.totalAmount.scaledUnits, 3_250_000);
  assert.equal(details?.items[0]?.subtotal.scaledUnits, 2_000_000);
});

test('distinguishes known zero cost from unknown historical cost', async () => {
  const zeroCost = item({
    unitCostSnapshot: Money.zero(),
    estimatedCost: Money.zero(),
    estimatedProfit: Money.fromDecimal('2.00'),
  });
  const unknownCost = item({
    id: 'sale-item-2',
    productId: 'product-2',
    unitCostSnapshot: null,
    estimatedCost: null,
    estimatedProfit: null,
    costStatus: 'UNKNOWN',
  });
  const { useCase: getSaleDetails } = useCase({
    sale: sale({ estimatedCost: null, estimatedProfit: null }),
    items: [zeroCost, unknownCost],
  });

  const details = await getSaleDetails.execute({
    inventoryId: INVENTORY_ID,
    saleId: SALE_ID,
  });

  assert.equal(details?.items[0]?.unitCostSnapshot?.scaledUnits, 0);
  assert.equal(details?.items[0]?.estimatedProfit?.scaledUnits, 2_000_000);
  assert.equal(details?.items[1]?.unitCostSnapshot, null);
  assert.equal(details?.items[1]?.estimatedProfit, null);
  assert.equal(details?.estimatedCost, null);
  assert.equal(details?.estimatedProfit, null);
});

test('keeps a Sale visible when its Product is archived or its label is unavailable', async () => {
  const { useCase: getSaleDetails } = useCase({
    sale: sale(),
    items: [item({}, null, null)],
  });

  const details = await getSaleDetails.execute({
    inventoryId: INVENTORY_ID,
    saleId: SALE_ID,
  });

  assert.equal(details?.items[0]?.productName, null);
  assert.equal(details?.items[0]?.unitSalePrice.scaledUnits, 1_000_000);
  assert.equal(details?.items[0]?.unitCostSnapshot?.scaledUnits, 700_000);
});

test('fails explicitly when total units exceed safe integer precision', async () => {
  const { useCase: getSaleDetails } = useCase({
    sale: sale(),
    items: [
      item({ quantity: Number.MAX_SAFE_INTEGER }),
      item({ id: 'sale-item-2', quantity: 1 }),
    ],
  });

  await assert.rejects(
    getSaleDetails.execute({ inventoryId: INVENTORY_ID, saleId: SALE_ID }),
    /total units must be a safe integer/i,
  );
});

test('propagates reader failures unchanged', async () => {
  const failure = new Error('read failed');
  const reader = new StubSaleDetailsReader(null, failure);
  const getSaleDetails = new GetSaleDetailsUseCase(reader);

  await assert.rejects(
    getSaleDetails.execute({ inventoryId: INVENTORY_ID, saleId: SALE_ID }),
    (error: unknown) => error === failure,
  );
});
