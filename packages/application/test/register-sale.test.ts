import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInventoryState,
  createProduct,
  Money,
  type InventoryMovement,
  type Product,
  type Sale,
  type SaleItem,
} from '@stock-app/domain';

import {
  DuplicateSaleProductError,
  EmptySaleError,
  MissingInventoryStateError,
  RegisterSaleUseCase,
  SaleProductUnavailableError,
  type Clock,
  type InventoryMovementIdGenerator,
  type InventoryMovementRepository,
  type InventoryStateRecord,
  type InventoryStateRepository,
  type ProductRepository,
  type RegisterSaleInput,
  type SaleIdGenerator,
  type SaleItemIdGenerator,
  type SaleItemRepository,
  type SaleRepository,
  type TransactionManager,
  type TransactionRepositories,
  type UpdateInventoryStateInput,
} from '../src/index';
import { unusedSaleVoidRepository } from './support/unused-sale-void-repository';

const TIMESTAMP = 1_776_444_000_000;

class SequenceIdGenerator
  implements SaleIdGenerator, SaleItemIdGenerator, InventoryMovementIdGenerator
{
  calls = 0;

  constructor(private readonly ids: readonly string[]) {}

  generate(): string {
    const id = this.ids[this.calls];
    this.calls += 1;

    if (id === undefined) {
      throw new Error('Fake ID sequence exhausted.');
    }

    return id;
  }
}

class FakeClock implements Clock {
  calls = 0;

  now(): number {
    this.calls += 1;
    return TIMESTAMP;
  }
}

type FailurePoint = 'sale' | 'item' | 'movement' | 'state';

interface HarnessOptions {
  readonly products?: readonly Product[];
  readonly states?: readonly InventoryStateRecord[];
  readonly failurePoint?: FailurePoint;
}

function product(
  id: string,
  inventoryId = 'inventory-1',
  isArchived = false,
): Product {
  const created = createProduct({
    id,
    inventoryId,
    name: id,
    regularSalePrice: Money.fromDecimal('1'),
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  });

  return isArchived ? Object.freeze({ ...created, isArchived: true }) : created;
}

function state(
  productId: string,
  stock: number,
  unitCost: Money | null,
  inventoryId = 'inventory-1',
): InventoryStateRecord {
  return Object.freeze({
    inventoryId,
    productId,
    state: createInventoryState({ stock, unitCost }),
  });
}

function defaultProducts(): readonly Product[] {
  return [product('product-a'), product('product-b')];
}

function defaultStates(): readonly InventoryStateRecord[] {
  return [
    state('product-a', 10, Money.fromDecimal('0.30')),
    state('product-b', 0, null),
  ];
}

function validInput(
  overrides: Partial<RegisterSaleInput> = {},
): RegisterSaleInput {
  return {
    inventoryId: 'inventory-1',
    items: [
      {
        productId: 'product-a',
        quantity: 2,
        unitSalePrice: Money.fromDecimal('0.50'),
      },
    ],
    notes: '  Cliente recoge mañana  ',
    ...overrides,
  };
}

function createHarness(options: HarnessOptions = {}) {
  const events: string[] = [];
  const transactionStates: boolean[] = [];
  const products = options.products ?? defaultProducts();
  const states = options.states ?? defaultStates();
  const savedSales: Sale[] = [];
  const savedItems: SaleItem[] = [];
  const savedMovements: InventoryMovement[] = [];
  const updatedStates: UpdateInventoryStateInput[] = [];
  const saleIds = new SequenceIdGenerator(['sale-1']);
  const itemIds = new SequenceIdGenerator(['item-1', 'item-2', 'item-3']);
  const movementIds = new SequenceIdGenerator([
    'movement-1',
    'movement-2',
    'movement-3',
  ]);
  const clock = new FakeClock();
  let transactionActive = false;

  const record = (event: string): void => {
    events.push(event);
    transactionStates.push(transactionActive);
  };
  const productRepository: ProductRepository = {
    async listByInventory() {
      record('products:list');
      return products;
    },
    async save() {
      throw new Error('RegisterSale must not save Products.');
    },
  };
  const inventoryStateRepository: InventoryStateRepository = {
    async listByInventory() {
      record('states:list');
      return states;
    },
    async save() {
      throw new Error('RegisterSale must not insert InventoryStates.');
    },
    async update(input) {
      record('state:update');
      updatedStates.push(input);

      if (options.failurePoint === 'state') {
        throw new Error('state update failed');
      }
    },
  };
  const inventoryMovementRepository: InventoryMovementRepository = {
    async save(movement) {
      record('movement:save');
      savedMovements.push(movement);

      if (options.failurePoint === 'movement') {
        throw new Error('movement save failed');
      }
    },
  };
  const saleRepository: SaleRepository = {
    async save(sale) {
      record('sale:save');
      savedSales.push(sale);

      if (options.failurePoint === 'sale') {
        throw new Error('sale save failed');
      }
    },
  };
  const saleItemRepository: SaleItemRepository = {
    async save(item) {
      record('item:save');
      savedItems.push(item);

      if (options.failurePoint === 'item') {
        throw new Error('item save failed');
      }
    },
  };
  const repositories: TransactionRepositories = {
    productRepository,
    inventoryStateRepository,
    inventoryMovementRepository,
    purchaseRepository: { async save() {} },
    saleRepository,
    saleItemRepository,
    stockAdjustmentRepository: {
      async save() {
        throw new Error('RegisterSale must not save StockAdjustments.');
      },
    },
    saleVoidRepository: unusedSaleVoidRepository,
  };
  const transactionManager: TransactionManager & { calls: number } = {
    calls: 0,
    async runInTransaction(operation) {
      this.calls += 1;
      events.push('transaction:start');
      transactionActive = true;

      try {
        const result = await operation(repositories);
        events.push('transaction:complete');
        return result;
      } finally {
        transactionActive = false;
      }
    },
  };
  const useCase = new RegisterSaleUseCase({
    saleIdGenerator: saleIds,
    saleItemIdGenerator: itemIds,
    inventoryMovementIdGenerator: movementIds,
    clock,
    transactionManager,
  });

  return {
    useCase,
    events,
    transactionStates,
    transactionManager,
    saleIds,
    itemIds,
    movementIds,
    clock,
    savedSales,
    savedItems,
    savedMovements,
    updatedStates,
  };
}

test('registers a single item with known cost', async () => {
  const { useCase } = createHarness();
  const result = await useCase.execute(validInput());

  assert.equal(result.sale.id, 'sale-1');
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.costStatus, 'KNOWN');
});

test('registers multiple items with known costs', async () => {
  const { useCase } = createHarness({
    states: [
      state('product-a', 10, Money.fromDecimal('0.30')),
      state('product-b', 5, Money.fromDecimal('0.25')),
    ],
  });
  const result = await useCase.execute(
    validInput({
      items: [
        {
          productId: 'product-a',
          quantity: 2,
          unitSalePrice: Money.fromDecimal('0.50'),
        },
        {
          productId: 'product-b',
          quantity: 1,
          unitSalePrice: Money.fromDecimal('0.75'),
        },
      ],
    }),
  );

  assert.equal(result.items.length, 2);
  assert.equal(
    result.items.every(({ costStatus }) => costStatus === 'KNOWN'),
    true,
  );
});

test('calculates the exact total from every subtotal', async () => {
  const { useCase } = createHarness();
  const result = await useCase.execute(
    validInput({
      items: [
        {
          productId: 'product-a',
          quantity: 2,
          unitSalePrice: Money.fromDecimal('0.50'),
        },
        {
          productId: 'product-b',
          quantity: 1,
          unitSalePrice: Money.fromDecimal('0.75'),
        },
      ],
    }),
  );

  assert.equal(result.sale.totalAmount.scaledUnits, 1_750_000);
});

test('calculates known item cost and profit from its snapshot', async () => {
  const { useCase } = createHarness();
  const item = (await useCase.execute(validInput())).items[0];

  assert.equal(item?.unitCostSnapshot?.scaledUnits, 300_000);
  assert.equal(item?.estimatedCost?.scaledUnits, 600_000);
  assert.equal(item?.estimatedProfit?.scaledUnits, 400_000);
});

test('preserves known zero cost as KNOWN', async () => {
  const { useCase } = createHarness({
    states: [state('product-a', 1, Money.zero())],
  });
  const item = (await useCase.execute(validInput())).items[0];

  assert.equal(item?.costStatus, 'KNOWN');
  assert.equal(item?.unitCostSnapshot?.scaledUnits, 0);
  assert.equal(item?.estimatedCost?.scaledUnits, 0);
  assert.equal(item?.estimatedProfit?.scaledUnits, 1_000_000);
});

test('keeps an unknown item cost and estimates null', async () => {
  const { useCase } = createHarness();
  const item = (
    await useCase.execute(
      validInput({
        items: [
          {
            productId: 'product-b',
            quantity: 1,
            unitSalePrice: Money.fromDecimal('0.75'),
          },
        ],
      }),
    )
  ).items[0];

  assert.equal(item?.costStatus, 'UNKNOWN');
  assert.equal(item?.unitCostSnapshot, null);
  assert.equal(item?.estimatedCost, null);
  assert.equal(item?.estimatedProfit, null);
});

test('one unknown item makes Sale cost and profit unavailable', async () => {
  const { useCase } = createHarness();
  const result = await useCase.execute(
    validInput({
      items: [
        {
          productId: 'product-a',
          quantity: 1,
          unitSalePrice: Money.fromDecimal('0.50'),
        },
        {
          productId: 'product-b',
          quantity: 1,
          unitSalePrice: Money.fromDecimal('0.75'),
        },
      ],
    }),
  );

  assert.equal(result.sale.estimatedCost, null);
  assert.equal(result.sale.estimatedProfit, null);
});

test('allows a negative estimated profit', async () => {
  const { useCase } = createHarness({
    states: [state('product-a', 5, Money.fromDecimal('0.75'))],
  });
  const result = await useCase.execute(validInput());

  assert.equal(result.items[0]?.estimatedProfit?.scaledUnits, -500_000);
  assert.equal(result.sale.estimatedProfit?.scaledUnits, -500_000);
});

test('decrements sufficient stock', async () => {
  const { useCase, updatedStates } = createHarness();
  await useCase.execute(validInput());

  assert.equal(updatedStates[0]?.state.stock, 8);
});

test('allows stock to reach exactly zero', async () => {
  const { useCase, updatedStates } = createHarness({
    states: [state('product-a', 2, Money.fromDecimal('0.30'))],
  });
  await useCase.execute(validInput());

  assert.equal(updatedStates[0]?.state.stock, 0);
});

test('allows insufficient stock to become negative', async () => {
  const { useCase, updatedStates } = createHarness({
    states: [state('product-a', 1, Money.fromDecimal('0.30'))],
  });
  await useCase.execute(validInput());

  assert.equal(updatedStates[0]?.state.stock, -1);
});

test('allows already-negative stock to become more negative', async () => {
  const { useCase, updatedStates } = createHarness({
    states: [state('product-a', -3, Money.fromDecimal('0.30'))],
  });
  await useCase.execute(validInput());

  assert.equal(updatedStates[0]?.state.stock, -5);
});

test('preserves InventoryState unit cost by reference', async () => {
  const unitCost = Money.fromDecimal('0.30');
  const { useCase, updatedStates } = createHarness({
    states: [state('product-a', 2, unitCost)],
  });
  await useCase.execute(validInput());

  assert.strictEqual(updatedStates[0]?.state.unitCost, unitCost);
});

test('creates exactly one SALE movement per item', async () => {
  const { useCase, savedMovements } = createHarness();
  await useCase.execute(
    validInput({
      items: [
        {
          productId: 'product-a',
          quantity: 1,
          unitSalePrice: Money.fromDecimal('0.50'),
        },
        {
          productId: 'product-b',
          quantity: 1,
          unitSalePrice: Money.fromDecimal('0.75'),
        },
      ],
    }),
  );

  assert.equal(savedMovements.length, 2);
  assert.equal(
    savedMovements.every(({ type }) => type === 'SALE'),
    true,
  );
});

test('uses negative quantityDelta', async () => {
  const { useCase, savedMovements } = createHarness();
  await useCase.execute(validInput());

  assert.equal(savedMovements[0]?.quantityDelta, -2);
});

test('captures correct stockBefore and stockAfter', async () => {
  const { useCase, savedMovements } = createHarness();
  await useCase.execute(validInput());

  assert.equal(savedMovements[0]?.stockBefore, 10);
  assert.equal(savedMovements[0]?.stockAfter, 8);
});

test('uses SALE as movement sourceType', async () => {
  const { useCase, savedMovements } = createHarness();
  await useCase.execute(validInput());

  assert.equal(savedMovements[0]?.sourceType, 'SALE');
});

test('uses Sale ID as every movement sourceId', async () => {
  const { useCase, savedMovements } = createHarness();
  const result = await useCase.execute(validInput());

  assert.equal(savedMovements[0]?.sourceId, result.sale.id);
});

test('movement snapshots preserve known and unknown costs', async () => {
  const { useCase, savedMovements } = createHarness();
  await useCase.execute(
    validInput({
      items: [
        {
          productId: 'product-a',
          quantity: 1,
          unitSalePrice: Money.fromDecimal('0.50'),
        },
        {
          productId: 'product-b',
          quantity: 1,
          unitSalePrice: Money.fromDecimal('0.75'),
        },
      ],
    }),
  );

  assert.equal(savedMovements[0]?.unitCostSnapshot?.scaledUnits, 300_000);
  assert.equal(savedMovements[1]?.unitCostSnapshot, null);
});

test('generates one Sale ID', async () => {
  const { useCase, saleIds } = createHarness();
  await useCase.execute(validInput());

  assert.equal(saleIds.calls, 1);
});

test('generates one SaleItem ID per line', async () => {
  const { useCase, itemIds } = createHarness();
  await useCase.execute(
    validInput({
      items: [
        {
          productId: 'product-a',
          quantity: 1,
          unitSalePrice: Money.fromDecimal('0.50'),
        },
        {
          productId: 'product-b',
          quantity: 1,
          unitSalePrice: Money.fromDecimal('0.75'),
        },
      ],
    }),
  );

  assert.equal(itemIds.calls, 2);
});

test('generates one Movement ID per line', async () => {
  const { useCase, movementIds } = createHarness();
  await useCase.execute(
    validInput({
      items: [
        {
          productId: 'product-a',
          quantity: 1,
          unitSalePrice: Money.fromDecimal('0.50'),
        },
        {
          productId: 'product-b',
          quantity: 1,
          unitSalePrice: Money.fromDecimal('0.75'),
        },
      ],
    }),
  );

  assert.equal(movementIds.calls, 2);
});

test('calls Clock exactly once', async () => {
  const { useCase, clock } = createHarness();
  await useCase.execute(validInput());

  assert.equal(clock.calls, 1);
});

test('shares one timestamp across Sale, items and movements', async () => {
  const { useCase, savedMovements } = createHarness();
  const result = await useCase.execute(validInput());

  assert.deepEqual(
    [
      result.sale.effectiveAt,
      result.sale.createdAt,
      result.sale.updatedAt,
      result.items[0]?.createdAt,
      result.items[0]?.updatedAt,
      savedMovements[0]?.effectiveAt,
      savedMovements[0]?.createdAt,
      savedMovements[0]?.updatedAt,
    ],
    Array(8).fill(TIMESTAMP),
  );
});

test('normalizes Sale notes through Domain', async () => {
  const { useCase } = createHarness();
  const result = await useCase.execute(validInput());

  assert.equal(result.sale.notes, 'Cliente recoge mañana');
});

async function assertRejectedBeforeTransaction(
  input: RegisterSaleInput,
  expected: new (...args: never[]) => Error,
): Promise<void> {
  const { useCase, transactionManager } = createHarness();

  await assert.rejects(() => useCase.execute(input), expected);
  assert.equal(transactionManager.calls, 0);
}

test('rejects an empty sale before opening a transaction', async () => {
  await assertRejectedBeforeTransaction(
    validInput({ items: [] }),
    EmptySaleError,
  );
});

test('rejects duplicate product IDs before opening a transaction', async () => {
  await assertRejectedBeforeTransaction(
    validInput({
      items: [
        {
          productId: 'product-a',
          quantity: 1,
          unitSalePrice: Money.fromDecimal('0.50'),
        },
        {
          productId: ' product-a ',
          quantity: 2,
          unitSalePrice: Money.fromDecimal('0.50'),
        },
      ],
    }),
    DuplicateSaleProductError,
  );
});

test('rejects zero quantity before opening a transaction', async () => {
  await assert.rejects(
    () =>
      createHarness().useCase.execute(
        validInput({
          items: [
            {
              productId: 'product-a',
              quantity: 0,
              unitSalePrice: Money.fromDecimal('0.50'),
            },
          ],
        }),
      ),
    /quantity.*greater than zero/i,
  );
});

test('rejects negative quantity before opening a transaction', async () => {
  const harness = createHarness();
  await assert.rejects(
    () =>
      harness.useCase.execute(
        validInput({
          items: [
            {
              productId: 'product-a',
              quantity: -1,
              unitSalePrice: Money.fromDecimal('0.50'),
            },
          ],
        }),
      ),
    /quantity.*greater than zero/i,
  );
  assert.equal(harness.transactionManager.calls, 0);
});

test('rejects fractional quantity before opening a transaction', async () => {
  const harness = createHarness();
  await assert.rejects(
    () =>
      harness.useCase.execute(
        validInput({
          items: [
            {
              productId: 'product-a',
              quantity: 1.5,
              unitSalePrice: Money.fromDecimal('0.50'),
            },
          ],
        }),
      ),
    /quantity.*safe integer/i,
  );
  assert.equal(harness.transactionManager.calls, 0);
});

test('rejects unsafe quantity before opening a transaction', async () => {
  const harness = createHarness();
  await assert.rejects(
    () =>
      harness.useCase.execute(
        validInput({
          items: [
            {
              productId: 'product-a',
              quantity: Number.MAX_SAFE_INTEGER + 1,
              unitSalePrice: Money.fromDecimal('0.50'),
            },
          ],
        }),
      ),
    /quantity.*safe integer/i,
  );
  assert.equal(harness.transactionManager.calls, 0);
});

test('rejects zero price before opening a transaction', async () => {
  const harness = createHarness();
  await assert.rejects(
    () =>
      harness.useCase.execute(
        validInput({
          items: [
            {
              productId: 'product-a',
              quantity: 1,
              unitSalePrice: Money.zero(),
            },
          ],
        }),
      ),
    /price.*greater than zero/i,
  );
  assert.equal(harness.transactionManager.calls, 0);
});

test('rejects an empty product ID before opening a transaction', async () => {
  const harness = createHarness();
  await assert.rejects(
    () =>
      harness.useCase.execute(
        validInput({
          items: [
            {
              productId: '   ',
              quantity: 1,
              unitSalePrice: Money.fromDecimal('0.50'),
            },
          ],
        }),
      ),
    /product id.*empty/i,
  );
  assert.equal(harness.transactionManager.calls, 0);
});

test('missing product aborts without writes', async () => {
  const harness = createHarness({ products: [] });

  await assert.rejects(
    () => harness.useCase.execute(validInput()),
    SaleProductUnavailableError,
  );
  assert.deepEqual(harness.savedSales, []);
  assert.deepEqual(harness.savedItems, []);
  assert.deepEqual(harness.savedMovements, []);
  assert.deepEqual(harness.updatedStates, []);
});

test('product from another inventory aborts without writes', async () => {
  const harness = createHarness({
    products: [product('product-a', 'inventory-2')],
  });

  await assert.rejects(
    () => harness.useCase.execute(validInput()),
    SaleProductUnavailableError,
  );
  assert.deepEqual(harness.savedSales, []);
});

test('archived product aborts without writes', async () => {
  const harness = createHarness({
    products: [product('product-a', 'inventory-1', true)],
  });

  await assert.rejects(
    () => harness.useCase.execute(validInput()),
    SaleProductUnavailableError,
  );
  assert.deepEqual(harness.savedSales, []);
});

test('missing InventoryState aborts without writes', async () => {
  const harness = createHarness({ states: [] });

  await assert.rejects(
    () => harness.useCase.execute(validInput()),
    MissingInventoryStateError,
  );
  assert.deepEqual(harness.savedSales, []);
  assert.deepEqual(harness.savedItems, []);
});

test('uses exactly one transaction', async () => {
  const { useCase, transactionManager } = createHarness();
  await useCase.execute(validInput());

  assert.equal(transactionManager.calls, 1);
});

test('all reads and writes use transaction-scoped repositories', async () => {
  const { useCase, transactionStates } = createHarness();
  await useCase.execute(validInput());

  assert.equal(transactionStates.length > 0, true);
  assert.equal(transactionStates.every(Boolean), true);
});

test('persists Sale, all items, movements and state updates in order', async () => {
  const { useCase, events } = createHarness();
  await useCase.execute(
    validInput({
      items: [
        {
          productId: 'product-a',
          quantity: 1,
          unitSalePrice: Money.fromDecimal('0.50'),
        },
        {
          productId: 'product-b',
          quantity: 1,
          unitSalePrice: Money.fromDecimal('0.75'),
        },
      ],
    }),
  );

  assert.deepEqual(events, [
    'transaction:start',
    'products:list',
    'states:list',
    'sale:save',
    'item:save',
    'item:save',
    'movement:save',
    'movement:save',
    'state:update',
    'state:update',
    'transaction:complete',
  ]);
});

for (const [failurePoint, message] of [
  ['sale', 'sale save failed'],
  ['item', 'item save failed'],
  ['movement', 'movement save failed'],
  ['state', 'state update failed'],
] as const) {
  test(`${failurePoint} repository failure propagates`, async () => {
    const harness = createHarness({ failurePoint });

    await assert.rejects(
      () => harness.useCase.execute(validInput()),
      new RegExp(message),
    );
    assert.equal(harness.transactionManager.calls, 1);
  });
}

test('does not retry or perform manual rollback after a failure', async () => {
  const harness = createHarness({ failurePoint: 'movement' });

  await assert.rejects(() => harness.useCase.execute(validInput()));
  assert.equal(harness.transactionManager.calls, 1);
  assert.equal(harness.savedSales.length, 1);
  assert.equal(harness.savedItems.length, 1);
  assert.equal(harness.savedMovements.length, 1);
  assert.equal(harness.updatedStates.length, 0);
});
