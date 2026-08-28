import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInventoryState,
  createProduct,
  Money,
  type InventoryMovement,
  type Product,
  type StockAdjustment,
} from '@stock-app/domain';

import {
  AdjustStockUseCase,
  AdjustmentCurrentCostRequiredError,
  AdjustmentProductUnavailableError,
  InvalidAdjustmentCostModeError,
  MissingAdjustmentInventoryStateError,
  NoStockAdjustmentNeededError,
  type AdjustStockInput,
  type Clock,
  type InventoryStateRecord,
  type TransactionManager,
  type TransactionRepositories,
  type UpdateInventoryStateInput,
} from '../src/index';
import { unusedSaleVoidRepository } from './support/unused-sale-void-repository';

const TIMESTAMP = 1_776_444_000_000;

class SequenceIdGenerator {
  calls = 0;

  constructor(private readonly id: string) {}

  generate(): string {
    this.calls += 1;
    return this.id;
  }
}

class FakeClock implements Clock {
  calls = 0;

  now(): number {
    this.calls += 1;
    return TIMESTAMP;
  }
}

type FailurePoint = 'adjustment' | 'movement' | 'state';

interface HarnessOptions {
  readonly product?: Product | null;
  readonly state?: InventoryStateRecord | null;
  readonly failurePoint?: FailurePoint;
}

function product(inventoryId = 'inventory-1', isArchived = false): Product {
  const active = createProduct({
    id: 'product-1',
    inventoryId,
    name: 'Coffee',
    regularSalePrice: Money.fromDecimal('4'),
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  });

  return isArchived ? Object.freeze({ ...active, isArchived: true }) : active;
}

function state(
  stock = 10,
  unitCost: Money | null = Money.fromDecimal('2'),
): InventoryStateRecord {
  return Object.freeze({
    inventoryId: 'inventory-1',
    productId: 'product-1',
    state: createInventoryState({ stock, unitCost }),
  });
}

function input(overrides: Partial<AdjustStockInput> = {}): AdjustStockInput {
  return {
    inventoryId: 'inventory-1',
    productId: 'product-1',
    actualStock: 15,
    reason: 'COUNT_CORRECTION',
    costMode: 'CUSTOM_COST',
    customUnitCost: Money.fromDecimal('4'),
    ...overrides,
  };
}

function createHarness(options: HarnessOptions = {}) {
  const events: string[] = [];
  const savedAdjustments: StockAdjustment[] = [];
  const savedMovements: InventoryMovement[] = [];
  const updatedStates: UpdateInventoryStateInput[] = [];
  const adjustmentIds = new SequenceIdGenerator('adjustment-1');
  const movementIds = new SequenceIdGenerator('movement-1');
  const clock = new FakeClock();
  let transactionActive = false;
  const record = (event: string): void => {
    assert.equal(transactionActive, true);
    events.push(event);
  };
  const repositories: TransactionRepositories = {
    productRepository: {
      async listByInventory() {
        record('products:list');
        return options.product === null ? [] : [options.product ?? product()];
      },
      async save() {
        throw new Error('AdjustStock must not save Products.');
      },
    },
    inventoryStateRepository: {
      async listByInventory() {
        record('states:list');
        return options.state === null ? [] : [options.state ?? state()];
      },
      async save() {
        throw new Error('AdjustStock must not insert InventoryStates.');
      },
      async update(value) {
        record('state:update');
        if (options.failurePoint === 'state') throw new Error('state failed');
        updatedStates.push(value);
      },
    },
    inventoryMovementRepository: {
      async save(value) {
        record('movement:save');
        if (options.failurePoint === 'movement') {
          throw new Error('movement failed');
        }
        savedMovements.push(value);
      },
    },
    stockAdjustmentRepository: {
      async save(value) {
        record('adjustment:save');
        if (options.failurePoint === 'adjustment') {
          throw new Error('adjustment failed');
        }
        savedAdjustments.push(value);
      },
    },
    purchaseRepository: { async save() {} },
    saleRepository: { async save() {} },
    saleItemRepository: { async save() {} },
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
  const useCase = new AdjustStockUseCase({
    stockAdjustmentIdGenerator: adjustmentIds,
    inventoryMovementIdGenerator: movementIds,
    clock,
    transactionManager,
  });

  return {
    useCase,
    events,
    savedAdjustments,
    savedMovements,
    updatedStates,
    adjustmentIds,
    movementIds,
    clock,
    transactionManager,
  };
}

test('registers positive CUSTOM_COST adjustment with weighted average', async () => {
  const harness = createHarness();
  const result = await harness.useCase.execute(input());

  assert.equal(result.adjustment.difference, 5);
  assert.equal(result.adjustment.unitCost?.scaledUnits, 4_000_000);
  assert.equal(result.resultingState.stock, 15);
  assert.equal(result.resultingState.unitCost?.scaledUnits, 2_666_667);
  assert.strictEqual(harness.savedAdjustments[0], result.adjustment);
  assert.strictEqual(harness.updatedStates[0]?.state, result.resultingState);
});

test('positive USE_CURRENT_COST uses current known zero exactly', async () => {
  const harness = createHarness({ state: state(10, Money.zero()) });
  const result = await harness.useCase.execute(
    input({ costMode: 'USE_CURRENT_COST', customUnitCost: null }),
  );

  assert.equal(result.adjustment.unitCost?.scaledUnits, 0);
  assert.equal(result.resultingState.unitCost?.scaledUnits, 0);
});

test('positive CUSTOM_COST preserves known zero', async () => {
  const harness = createHarness({ state: state(0, null) });
  const result = await harness.useCase.execute(
    input({ actualStock: 3, customUnitCost: Money.zero() }),
  );

  assert.equal(result.adjustment.unitCost?.scaledUnits, 0);
  assert.equal(result.resultingState.unitCost?.scaledUnits, 0);
});

for (const [label, stockBefore, actualStock] of [
  ['zero stock becomes positive', 0, 5],
  ['negative reaches zero', -3, 0],
  ['negative becomes positive', -2, 3],
] as const) {
  test(`${label} uses custom incoming cost without weighting deficit`, async () => {
    const harness = createHarness({ state: state(stockBefore, null) });
    const result = await harness.useCase.execute(
      input({ actualStock, customUnitCost: Money.fromDecimal('3') }),
    );

    assert.equal(result.resultingState.stock, actualStock);
    assert.equal(result.resultingState.unitCost?.scaledUnits, 3_000_000);
  });
}

for (const reason of [
  'COUNT_CORRECTION',
  'DAMAGED',
  'LOST',
  'INTERNAL_USE',
  'OTHER',
] as const) {
  test(`negative ${reason} preserves current cost`, async () => {
    const harness = createHarness();
    const result = await harness.useCase.execute(
      input({
        actualStock: 7,
        reason,
        costMode: null,
        customUnitCost: null,
      }),
    );

    assert.equal(result.adjustment.difference, -3);
    assert.equal(result.adjustment.costMode, null);
    assert.equal(result.adjustment.unitCost?.scaledUnits, 2_000_000);
    assert.equal(result.resultingState.unitCost?.scaledUnits, 2_000_000);
  });
}

for (const reason of ['DAMAGED', 'LOST', 'INTERNAL_USE'] as const) {
  test(`positive ${reason} is rejected by Domain`, async () => {
    const harness = createHarness();
    await assert.rejects(
      () => harness.useCase.execute(input({ reason })),
      /positive adjustment reason/i,
    );
    assert.deepEqual(harness.savedAdjustments, []);
  });
}

test('creates exactly one linked adjustment movement with the resolved cost', async () => {
  const harness = createHarness();
  const result = await harness.useCase.execute(input());

  assert.deepEqual(harness.savedMovements, [
    {
      id: 'movement-1',
      inventoryId: 'inventory-1',
      productId: 'product-1',
      type: 'ADJUSTMENT_IN',
      quantityDelta: 5,
      unitCostSnapshot: result.adjustment.unitCost,
      stockBefore: 10,
      stockAfter: 15,
      sourceType: 'STOCK_ADJUSTMENT',
      sourceId: 'adjustment-1',
      metadata: null,
      effectiveAt: TIMESTAMP,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    },
  ]);
});

test('negative adjustment movement is ADJUSTMENT_OUT', async () => {
  const harness = createHarness();
  await harness.useCase.execute(
    input({
      actualStock: 7,
      reason: 'DAMAGED',
      costMode: null,
      customUnitCost: null,
    }),
  );

  assert.equal(harness.savedMovements[0]?.type, 'ADJUSTMENT_OUT');
  assert.equal(harness.savedMovements[0]?.quantityDelta, -3);
  assert.equal(
    harness.savedMovements[0]?.unitCostSnapshot?.scaledUnits,
    2_000_000,
  );
});

test('generates both IDs and reads Clock exactly once', async () => {
  const harness = createHarness();
  const result = await harness.useCase.execute(input());

  assert.equal(harness.adjustmentIds.calls, 1);
  assert.equal(harness.movementIds.calls, 1);
  assert.equal(harness.clock.calls, 1);
  assert.deepEqual(
    [
      result.adjustment.effectiveAt,
      result.adjustment.createdAt,
      result.adjustment.updatedAt,
      harness.savedMovements[0]?.effectiveAt,
      harness.savedMovements[0]?.createdAt,
      harness.savedMovements[0]?.updatedAt,
    ],
    Array(6).fill(TIMESTAMP),
  );
});

async function rejectBeforeTransaction(
  invalidInput: AdjustStockInput,
  expected: RegExp,
): Promise<void> {
  const harness = createHarness();
  await assert.rejects(() => harness.useCase.execute(invalidInput), expected);
  assert.equal(harness.transactionManager.calls, 0);
}

for (const [label, invalidInput, expected] of [
  ['empty inventory ID', input({ inventoryId: ' ' }), /inventory id.*empty/i],
  ['empty product ID', input({ productId: '' }), /product id.*empty/i],
  ['negative actual stock', input({ actualStock: -1 }), /non-negative/i],
  ['fractional actual stock', input({ actualStock: 1.5 }), /safe integer/i],
  [
    'unsafe actual stock',
    input({ actualStock: Number.MAX_SAFE_INTEGER + 1 }),
    /safe integer/i,
  ],
  ['invalid reason', input({ reason: 'INVALID' as never }), /reason.*invalid/i],
  [
    'negative custom cost',
    input({ customUnitCost: Money.fromDecimal('-0.000001') }),
    /must not be negative/i,
  ],
] as const) {
  test(`rejects ${label} before the transaction`, async () => {
    await rejectBeforeTransaction(invalidInput, expected);
  });
}

test('rejects no-op without IDs or writes', async () => {
  const harness = createHarness();
  await assert.rejects(
    () => harness.useCase.execute(input({ actualStock: 10 })),
    NoStockAdjustmentNeededError,
  );
  assert.equal(harness.adjustmentIds.calls, 0);
  assert.equal(harness.movementIds.calls, 0);
  assert.deepEqual(harness.savedAdjustments, []);
  assert.deepEqual(harness.savedMovements, []);
  assert.deepEqual(harness.updatedStates, []);
});

for (const [label, override, expected] of [
  ['positive without mode', { costMode: null }, InvalidAdjustmentCostModeError],
  [
    'current mode with custom',
    { costMode: 'USE_CURRENT_COST', customUnitCost: Money.fromDecimal('1') },
    InvalidAdjustmentCostModeError,
  ],
  [
    'custom mode without custom',
    { costMode: 'CUSTOM_COST', customUnitCost: null },
    InvalidAdjustmentCostModeError,
  ],
  [
    'negative with mode',
    { actualStock: 7, costMode: 'USE_CURRENT_COST', customUnitCost: null },
    InvalidAdjustmentCostModeError,
  ],
  [
    'negative with custom',
    { actualStock: 7, costMode: null, customUnitCost: Money.fromDecimal('1') },
    InvalidAdjustmentCostModeError,
  ],
] as const) {
  test(`rejects ${label}`, async () => {
    const harness = createHarness();
    await assert.rejects(
      () =>
        harness.useCase.execute(input(override as Partial<AdjustStockInput>)),
      expected,
    );
  });
}

test('rejects USE_CURRENT_COST when current cost is unknown', async () => {
  const harness = createHarness({ state: state(0, null) });
  await assert.rejects(
    () =>
      harness.useCase.execute(
        input({ costMode: 'USE_CURRENT_COST', customUnitCost: null }),
      ),
    AdjustmentCurrentCostRequiredError,
  );
});

for (const [label, options, expected] of [
  ['missing product', { product: null }, AdjustmentProductUnavailableError],
  [
    'archived product',
    { product: product('inventory-1', true) },
    AdjustmentProductUnavailableError,
  ],
  [
    'other inventory product',
    { product: product('inventory-2') },
    AdjustmentProductUnavailableError,
  ],
  ['missing state', { state: null }, MissingAdjustmentInventoryStateError],
] as const) {
  test(`rejects ${label} without writes`, async () => {
    const harness = createHarness(options);
    await assert.rejects(() => harness.useCase.execute(input()), expected);
    assert.deepEqual(harness.savedAdjustments, []);
    assert.deepEqual(harness.savedMovements, []);
    assert.deepEqual(harness.updatedStates, []);
  });
}

test('uses one scoped transaction and approved persistence order', async () => {
  const harness = createHarness();
  await harness.useCase.execute(input());

  assert.equal(harness.transactionManager.calls, 1);
  assert.deepEqual(harness.events, [
    'transaction:start',
    'products:list',
    'states:list',
    'adjustment:save',
    'movement:save',
    'state:update',
    'transaction:complete',
  ]);
});

for (const failurePoint of ['adjustment', 'movement', 'state'] as const) {
  test(`${failurePoint} failure propagates without retry`, async () => {
    const harness = createHarness({ failurePoint });
    await assert.rejects(
      () => harness.useCase.execute(input()),
      new RegExp(`${failurePoint} failed`),
    );
    assert.equal(harness.transactionManager.calls, 1);
  });
}
