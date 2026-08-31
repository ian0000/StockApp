import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInventoryState,
  createProduct,
  Money,
  type InventoryMovement,
  type Product,
  type Purchase,
} from '@stock-app/domain';

import {
  MissingPurchaseInventoryStateError,
  PurchaseProductUnavailableError,
  RegisterPurchaseUseCase,
  type Clock,
  type InventoryMovementIdGenerator,
  type InventoryMovementRepository,
  type InventoryStateRecord,
  type InventoryStateRepository,
  type ProductRepository,
  type PurchaseIdGenerator,
  type PurchaseRepository,
  type RegisterPurchaseInput,
  type SaleItemRepository,
  type SaleRepository,
  type TransactionManager,
  type TransactionRepositories,
  type UpdateInventoryStateInput,
} from '../src/index';
import {
  unusedPurchaseVoidRepository,
  unusedSaleVoidRepository,
} from './support/unused-sale-void-repository';

const TIMESTAMP = 1_776_444_000_000;

class SequenceIdGenerator
  implements PurchaseIdGenerator, InventoryMovementIdGenerator
{
  calls = 0;

  constructor(private readonly ids: readonly string[]) {}

  generate(): string {
    const id = this.ids[this.calls];
    this.calls += 1;

    if (id === undefined) throw new Error('Fake ID sequence exhausted.');

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

type FailurePoint = 'purchase' | 'movement' | 'state';

interface HarnessOptions {
  readonly products?: readonly Product[];
  readonly states?: readonly InventoryStateRecord[];
  readonly failurePoint?: FailurePoint;
}

function product(
  id = 'product-1',
  inventoryId = 'inventory-1',
  isArchived = false,
): Product {
  const active = createProduct({
    id,
    inventoryId,
    name: 'Coffee',
    regularSalePrice: Money.fromDecimal('2'),
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  });

  return isArchived ? Object.freeze({ ...active, isArchived: true }) : active;
}

function state(
  stock = 20,
  unitCost: Money | null = Money.fromDecimal('10'),
  inventoryId = 'inventory-1',
  productId = 'product-1',
): InventoryStateRecord {
  return Object.freeze({
    inventoryId,
    productId,
    state: createInventoryState({ stock, unitCost }),
  });
}

function validInput(
  overrides: Partial<RegisterPurchaseInput> = {},
): RegisterPurchaseInput {
  return {
    inventoryId: 'inventory-1',
    productId: 'product-1',
    quantity: 10,
    unitCost: Money.fromDecimal('12'),
    notes: '  Entrega de proveedor\nmañana  ',
    ...overrides,
  };
}

function createHarness(options: HarnessOptions = {}) {
  const events: string[] = [];
  const transactionStates: boolean[] = [];
  const savedPurchases: Purchase[] = [];
  const savedMovements: InventoryMovement[] = [];
  const updatedStates: UpdateInventoryStateInput[] = [];
  const purchaseIds = new SequenceIdGenerator(['purchase-1']);
  const movementIds = new SequenceIdGenerator(['movement-1']);
  const clock = new FakeClock();
  let transactionActive = false;

  const record = (event: string): void => {
    events.push(event);
    transactionStates.push(transactionActive);
  };
  const productRepository: ProductRepository = {
    async listByInventory() {
      record('products:list');
      return options.products ?? [product()];
    },
    async save() {
      throw new Error('RegisterPurchase must not save Products.');
    },
  };
  const inventoryStateRepository: InventoryStateRepository = {
    async listByInventory() {
      record('states:list');
      return options.states ?? [state()];
    },
    async save() {
      throw new Error('RegisterPurchase must not insert InventoryStates.');
    },
    async update(input) {
      record('state:update');
      updatedStates.push(input);
      if (options.failurePoint === 'state') throw new Error('state failed');
    },
  };
  const inventoryMovementRepository: InventoryMovementRepository = {
    async save(movement) {
      record('movement:save');
      savedMovements.push(movement);
      if (options.failurePoint === 'movement') {
        throw new Error('movement failed');
      }
    },
  };
  const purchaseRepository: PurchaseRepository = {
    async save(purchase) {
      record('purchase:save');
      savedPurchases.push(purchase);
      if (options.failurePoint === 'purchase') {
        throw new Error('purchase failed');
      }
    },
  };
  const saleRepository: SaleRepository = {
    async save() {
      throw new Error('RegisterPurchase must not save Sales.');
    },
  };
  const saleItemRepository: SaleItemRepository = {
    async save() {
      throw new Error('RegisterPurchase must not save SaleItems.');
    },
  };
  const repositories: TransactionRepositories = {
    productRepository,
    inventoryStateRepository,
    inventoryMovementRepository,
    purchaseRepository,
    saleRepository,
    saleItemRepository,
    stockAdjustmentRepository: {
      async save() {
        throw new Error('RegisterPurchase must not save StockAdjustments.');
      },
    },
    saleVoidRepository: unusedSaleVoidRepository,
    purchaseVoidRepository: unusedPurchaseVoidRepository,
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
  const useCase = new RegisterPurchaseUseCase({
    purchaseIdGenerator: purchaseIds,
    inventoryMovementIdGenerator: movementIds,
    clock,
    transactionManager,
  });

  return {
    useCase,
    events,
    transactionStates,
    transactionManager,
    purchaseIds,
    movementIds,
    clock,
    savedPurchases,
    savedMovements,
    updatedStates,
  };
}

test('registers a purchase with exact derived fields and normalized notes', async () => {
  const harness = createHarness();
  const { purchase } = await harness.useCase.execute(validInput());

  assert.equal(purchase.id, 'purchase-1');
  assert.equal(purchase.inventoryId, 'inventory-1');
  assert.equal(purchase.productId, 'product-1');
  assert.equal(purchase.quantity, 10);
  assert.equal(purchase.unitCost.scaledUnits, 12_000_000);
  assert.equal(purchase.totalAmount.scaledUnits, 120_000_000);
  assert.equal(purchase.status, 'CONFIRMED');
  assert.equal(purchase.notes, 'Entrega de proveedor\nmañana');
  assert.strictEqual(harness.savedPurchases[0], purchase);
});

test('generates one Purchase ID, one Movement ID and calls Clock once', async () => {
  const harness = createHarness();
  const { purchase } = await harness.useCase.execute(validInput());
  const movement = harness.savedMovements[0];

  assert.equal(harness.purchaseIds.calls, 1);
  assert.equal(harness.movementIds.calls, 1);
  assert.equal(harness.clock.calls, 1);
  assert.deepEqual(
    [
      purchase.effectiveAt,
      purchase.createdAt,
      purchase.updatedAt,
      movement?.effectiveAt,
      movement?.createdAt,
      movement?.updatedAt,
    ],
    Array(6).fill(TIMESTAMP),
  );
});

test('uses weighted average and exact snapshots for positive stock', async () => {
  const harness = createHarness();
  const result = await harness.useCase.execute(validInput());
  const { purchase } = result;

  assert.equal(purchase.stockBefore, 20);
  assert.equal(purchase.stockAfter, 30);
  assert.equal(purchase.averageCostBefore?.scaledUnits, 10_000_000);
  assert.equal(purchase.averageCostAfter.scaledUnits, 10_666_667);
  assert.equal(harness.updatedStates[0]?.state.stock, 30);
  assert.equal(
    harness.updatedStates[0]?.state.unitCost?.scaledUnits,
    10_666_667,
  );
  assert.equal(result.beforeInventoryState.stock, 20);
  assert.equal(result.beforeInventoryState.unitCost?.scaledUnits, 10_000_000);
  assert.equal(result.afterInventoryState.stock, 30);
  assert.equal(result.afterInventoryState.unitCost?.scaledUnits, 10_666_667);
  assert.equal(result.priceAnalysis.regularSalePrice.scaledUnits, 2_000_000);
  assert.equal(result.priceAnalysis.costChanged, true);
  assert.equal(result.priceAnalysis.previousMargin?.scaledUnits, -400_000_000);
  assert.equal(result.priceAnalysis.currentMargin?.scaledUnits, -433_333_350);
  assert.equal(result.priceAnalysis.suggestedSalePrice?.scaledUnits, 2_133_333);
});

for (const [label, previousCost] of [
  ['unknown', null],
  ['known', Money.fromDecimal('9')],
] as const) {
  test(`stock zero ignores ${label} previous cost`, async () => {
    const harness = createHarness({ states: [state(0, previousCost)] });
    const { purchase, priceAnalysis } = await harness.useCase.execute(
      validInput({ quantity: 5, unitCost: Money.fromDecimal('2') }),
    );

    assert.strictEqual(purchase.averageCostBefore, previousCost);
    assert.equal(purchase.averageCostAfter.scaledUnits, 2_000_000);
    assert.equal(purchase.stockAfter, 5);
    assert.equal(priceAnalysis.currentUnitCost.scaledUnits, 2_000_000);
    assert.equal(priceAnalysis.currentMargin?.scaledUnits, 0);

    if (previousCost === null) {
      assert.equal(priceAnalysis.previousMargin, null);
      assert.equal(priceAnalysis.suggestedSalePrice, null);
    } else {
      assert.equal(priceAnalysis.previousMargin?.scaledUnits, -350_000_000);
      assert.equal(priceAnalysis.suggestedSalePrice?.scaledUnits, 444_444);
    }
  });
}

for (const [stockBefore, quantity, stockAfter] of [
  [-10, 4, -6],
  [-10, 10, 0],
  [-10, 15, 5],
] as const) {
  test(`negative stock ${stockBefore} plus ${quantity} becomes ${stockAfter} without weighting deficit`, async () => {
    const harness = createHarness({ states: [state(stockBefore, null)] });
    const { purchase, afterInventoryState } = await harness.useCase.execute(
      validInput({ quantity, unitCost: Money.fromDecimal('2') }),
    );

    assert.equal(purchase.stockAfter, stockAfter);
    assert.equal(purchase.averageCostBefore, null);
    assert.equal(purchase.averageCostAfter.scaledUnits, 2_000_000);
    assert.equal(afterInventoryState.unitCost?.scaledUnits, 2_000_000);
  });
}

test('negative stock suggestion uses incoming cost without weighting the deficit', async () => {
  const harness = createHarness({
    states: [state(-10, Money.fromDecimal('10'))],
  });
  const result = await harness.useCase.execute(
    validInput({ quantity: 4, unitCost: Money.fromDecimal('12') }),
  );

  assert.equal(result.afterInventoryState.stock, -6);
  assert.equal(result.priceAnalysis.currentUnitCost.scaledUnits, 12_000_000);
  assert.equal(result.priceAnalysis.suggestedSalePrice?.scaledUnits, 2_400_000);
});

test('preserves known zero purchase cost and resulting average', async () => {
  const harness = createHarness({ states: [state(0, null)] });
  const { purchase } = await harness.useCase.execute(
    validInput({ quantity: 2, unitCost: Money.zero() }),
  );

  assert.equal(purchase.unitCost.scaledUnits, 0);
  assert.equal(purchase.totalAmount.scaledUnits, 0);
  assert.equal(purchase.averageCostAfter.scaledUnits, 0);
});

test('creates exactly one linked PURCHASE movement with purchase cost snapshot', async () => {
  const harness = createHarness();
  const { purchase } = await harness.useCase.execute(validInput());

  assert.equal(harness.savedMovements.length, 1);
  assert.deepEqual(harness.savedMovements[0], {
    id: 'movement-1',
    inventoryId: 'inventory-1',
    productId: 'product-1',
    type: 'PURCHASE',
    quantityDelta: 10,
    unitCostSnapshot: purchase.unitCost,
    stockBefore: 20,
    stockAfter: 30,
    sourceType: 'PURCHASE',
    sourceId: purchase.id,
    metadata: null,
    effectiveAt: TIMESTAMP,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  });
});

async function assertRejectedBeforeTransaction(
  input: RegisterPurchaseInput,
  expected: RegExp,
): Promise<void> {
  const harness = createHarness();
  await assert.rejects(() => harness.useCase.execute(input), expected);
  assert.equal(harness.transactionManager.calls, 0);
}

for (const [label, input, expected] of [
  [
    'empty inventory ID',
    validInput({ inventoryId: '  ' }),
    /inventory id.*empty/i,
  ],
  ['empty product ID', validInput({ productId: '' }), /product id.*empty/i],
  [
    'zero quantity',
    validInput({ quantity: 0 }),
    /quantity.*greater than zero/i,
  ],
  [
    'negative quantity',
    validInput({ quantity: -1 }),
    /quantity.*greater than zero/i,
  ],
  [
    'fractional quantity',
    validInput({ quantity: 1.5 }),
    /quantity.*safe integer/i,
  ],
  [
    'unsafe quantity',
    validInput({ quantity: Number.MAX_SAFE_INTEGER + 1 }),
    /quantity.*safe integer/i,
  ],
  [
    'negative unit cost',
    validInput({ unitCost: Money.fromDecimal('-0.000001') }),
    /unit cost.*negative/i,
  ],
] as const) {
  test(`rejects ${label} before opening a transaction`, async () => {
    await assertRejectedBeforeTransaction(input, expected);
  });
}

test('rejects a missing product without writes', async () => {
  const harness = createHarness({ products: [] });

  await assert.rejects(
    () => harness.useCase.execute(validInput()),
    PurchaseProductUnavailableError,
  );
  assert.deepEqual(harness.savedPurchases, []);
  assert.deepEqual(harness.savedMovements, []);
  assert.deepEqual(harness.updatedStates, []);
});

test('rejects a product from another inventory', async () => {
  const harness = createHarness({
    products: [product('product-1', 'inventory-2')],
  });

  await assert.rejects(
    () => harness.useCase.execute(validInput()),
    PurchaseProductUnavailableError,
  );
});

test('rejects an archived product', async () => {
  const harness = createHarness({
    products: [product('product-1', 'inventory-1', true)],
  });

  await assert.rejects(
    () => harness.useCase.execute(validInput()),
    PurchaseProductUnavailableError,
  );
});

test('rejects a missing InventoryState without writes', async () => {
  const harness = createHarness({ states: [] });

  await assert.rejects(
    () => harness.useCase.execute(validInput()),
    MissingPurchaseInventoryStateError,
  );
  assert.deepEqual(harness.savedPurchases, []);
  assert.deepEqual(harness.savedMovements, []);
  assert.deepEqual(harness.updatedStates, []);
});

test('uses one transaction and only transaction-scoped repositories', async () => {
  const harness = createHarness();
  await harness.useCase.execute(validInput());

  assert.equal(harness.transactionManager.calls, 1);
  assert.equal(harness.transactionStates.length > 0, true);
  assert.equal(harness.transactionStates.every(Boolean), true);
});

test('persists Purchase, movement and state update in approved order', async () => {
  const harness = createHarness();
  await harness.useCase.execute(validInput());

  assert.deepEqual(harness.events, [
    'transaction:start',
    'products:list',
    'states:list',
    'purchase:save',
    'movement:save',
    'state:update',
    'transaction:complete',
  ]);
});

for (const failurePoint of ['purchase', 'movement', 'state'] as const) {
  test(`${failurePoint} failure propagates without retry or manual rollback`, async () => {
    const harness = createHarness({ failurePoint });

    await assert.rejects(
      () => harness.useCase.execute(validInput()),
      new RegExp(`${failurePoint} failed`),
    );
    assert.equal(harness.transactionManager.calls, 1);
  });
}
