import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInventoryMovement,
  createInventoryState,
  createPurchase,
  Money,
  type InventoryMovement,
  type InventoryMovementType,
  type InventoryState,
  type Purchase,
} from '@stock-app/domain';

import {
  ConfirmedPurchaseHasReversalError,
  PurchaseNotFoundError,
  PurchaseVoidInconsistentDataError,
  VoidPurchaseUseCase,
  type Clock,
  type InventoryMovementIdGenerator,
  type PurchaseVoidRepository,
  type TransactionManager,
  type TransactionRepositories,
} from '../src/index';
import { unusedSaleVoidRepository } from './support/unused-sale-void-repository';

const PURCHASE_AT = 1_776_444_000_000;
const VOIDED_AT = PURCHASE_AT + 1_000;

function purchaseFixture(
  overrides: Partial<Parameters<typeof createPurchase>[0]> = {},
): Purchase {
  return createPurchase({
    id: 'purchase-1',
    inventoryId: 'inventory-1',
    productId: 'product-1',
    quantity: 10,
    unitCost: Money.fromDecimal('20'),
    totalAmount: Money.fromDecimal('200'),
    effectiveAt: PURCHASE_AT,
    createdAt: PURCHASE_AT,
    updatedAt: PURCHASE_AT,
    status: 'CONFIRMED',
    notes: null,
    averageCostBefore: Money.fromDecimal('10'),
    averageCostAfter: Money.fromDecimal('15'),
    stockBefore: 10,
    stockAfter: 20,
    ...overrides,
  });
}

function movementFixture(
  purchase: Purchase,
  overrides: Partial<Parameters<typeof createInventoryMovement>[0]> = {},
): InventoryMovement {
  return createInventoryMovement({
    id: 'movement-1',
    inventoryId: purchase.inventoryId,
    productId: purchase.productId,
    type: 'PURCHASE',
    quantityDelta: purchase.quantity,
    unitCostSnapshot: purchase.unitCost,
    stockBefore: purchase.stockBefore,
    stockAfter: purchase.stockAfter,
    sourceType: 'PURCHASE',
    sourceId: purchase.id,
    metadata: null,
    effectiveAt: PURCHASE_AT,
    createdAt: PURCHASE_AT,
    updatedAt: PURCHASE_AT,
    ...overrides,
  });
}

interface HarnessOptions {
  readonly storedPurchase?: Purchase | null;
  readonly originals?: readonly InventoryMovement[];
  readonly reversals?: readonly InventoryMovement[];
  readonly otherMovements?: readonly InventoryMovement[];
  readonly state?: InventoryState | null;
  readonly failWrite?: 'reversal' | 'state' | 'purchase';
}

function createHarness(options: HarnessOptions = {}) {
  const storedPurchase =
    options.storedPurchase === undefined
      ? purchaseFixture()
      : options.storedPurchase;
  const defaultOriginal =
    storedPurchase === null ? null : movementFixture(storedPurchase);
  const originals =
    options.originals ?? (defaultOriginal === null ? [] : [defaultOriginal]);
  const state =
    options.state === undefined && storedPurchase !== null
      ? createInventoryState({
          stock: storedPurchase.stockAfter,
          unitCost: storedPurchase.averageCostAfter,
        })
      : (options.state ?? null);
  const events: string[] = [];
  const savedReversals: InventoryMovement[] = [];
  const updatedStates: Parameters<
    PurchaseVoidRepository['updateInventoryState']
  >[0][] = [];
  const updatedPurchases: Purchase[] = [];
  let transactionActive = false;

  const purchaseVoidRepository: PurchaseVoidRepository = {
    async findPurchase(inventoryId, purchaseId) {
      events.push('purchase:find');
      return storedPurchase?.inventoryId === inventoryId &&
        storedPurchase.id === purchaseId
        ? storedPurchase
        : null;
    },
    async listOriginalPurchaseMovements() {
      events.push('originals:list');
      return originals;
    },
    async listReversals() {
      events.push('reversals:list');
      return options.reversals ?? [];
    },
    async listProductMovementsAtOrAfter() {
      events.push('movements:list');
      return options.otherMovements ?? originals;
    },
    async listInventoryStates() {
      events.push('states:list');
      return state === null || storedPurchase === null
        ? []
        : [
            {
              inventoryId: storedPurchase.inventoryId,
              productId: storedPurchase.productId,
              state,
            },
          ];
    },
    async saveReversal(value) {
      assert.equal(transactionActive, true);
      events.push('reversal:save');
      if (options.failWrite === 'reversal') throw new Error('reversal failed');
      savedReversals.push(value);
    },
    async updateInventoryState(value) {
      assert.equal(transactionActive, true);
      events.push('state:update');
      if (options.failWrite === 'state') throw new Error('state failed');
      updatedStates.push(value);
    },
    async updatePurchase(value) {
      assert.equal(transactionActive, true);
      events.push('purchase:update');
      if (options.failWrite === 'purchase') throw new Error('purchase failed');
      updatedPurchases.push(value);
    },
  };
  const repositories: TransactionRepositories = {
    productRepository: {
      async listByInventory() {
        return [];
      },
      async save() {},
    },
    inventoryStateRepository: {
      async listByInventory() {
        return [];
      },
      async save() {},
      async update() {},
    },
    inventoryMovementRepository: { async save() {} },
    purchaseRepository: { async save() {} },
    saleRepository: { async save() {} },
    saleItemRepository: { async save() {} },
    stockAdjustmentRepository: { async save() {} },
    saleVoidRepository: unusedSaleVoidRepository,
    purchaseVoidRepository,
  };
  const transactionManager: TransactionManager & { calls: number } = {
    calls: 0,
    async runInTransaction(operation) {
      this.calls += 1;
      transactionActive = true;
      try {
        return await operation(repositories);
      } finally {
        transactionActive = false;
      }
    },
  };
  const ids: InventoryMovementIdGenerator & { calls: number } = {
    calls: 0,
    generate() {
      this.calls += 1;
      return `reversal-${this.calls}`;
    },
  };
  const clock: Clock & { calls: number } = {
    calls: 0,
    now() {
      this.calls += 1;
      return VOIDED_AT;
    },
  };
  const useCase = new VoidPurchaseUseCase({
    inventoryMovementIdGenerator: ids,
    clock,
    transactionManager,
  });

  return {
    useCase,
    events,
    ids,
    clock,
    savedReversals,
    updatedStates,
    updatedPurchases,
    transactionManager,
  };
}

test('voids an eligible confirmed Purchase atomically', async () => {
  const harness = createHarness();
  const result = await harness.useCase.execute({
    inventoryId: 'inventory-1',
    purchaseId: 'purchase-1',
  });

  assert.equal(result.kind, 'VOIDED');
  assert.equal(result.purchase.status, 'VOIDED');
  assert.equal(harness.savedReversals.length, 1);
  assert.equal(harness.updatedStates[0]?.state.stock, 10);
  assert.equal(harness.updatedPurchases[0]?.status, 'VOIDED');
  assert.deepEqual(harness.events.slice(-3), [
    'reversal:save',
    'state:update',
    'purchase:update',
  ]);
});

test('restores positive stock and average cost snapshots exactly', async () => {
  const harness = createHarness();
  await harness.useCase.execute({
    inventoryId: 'inventory-1',
    purchaseId: 'purchase-1',
  });

  assert.equal(harness.updatedStates[0]?.state.stock, 10);
  assert.equal(
    harness.updatedStates[0]?.state.unitCost?.scaledUnits,
    10_000_000,
  );
});

for (const scenario of [
  {
    name: 'zero stock and its historical cost',
    purchase: purchaseFixture({
      stockBefore: 0,
      stockAfter: 10,
      averageCostBefore: Money.fromDecimal('7'),
      averageCostAfter: Money.fromDecimal('20'),
    }),
    expectedStock: 0,
    expectedCost: 7_000_000,
  },
  {
    name: 'negative stock after crossing into positive stock',
    purchase: purchaseFixture({
      stockBefore: -5,
      stockAfter: 5,
      averageCostBefore: Money.fromDecimal('10'),
      averageCostAfter: Money.fromDecimal('20'),
    }),
    expectedStock: -5,
    expectedCost: 10_000_000,
  },
  {
    name: 'negative stock that remained negative',
    purchase: purchaseFixture({
      quantity: 3,
      unitCost: Money.fromDecimal('12'),
      totalAmount: Money.fromDecimal('36'),
      stockBefore: -10,
      stockAfter: -7,
      averageCostBefore: Money.fromDecimal('9'),
      averageCostAfter: Money.fromDecimal('12'),
    }),
    expectedStock: -10,
    expectedCost: 9_000_000,
  },
] as const) {
  test(`restores ${scenario.name}`, async () => {
    const harness = createHarness({ storedPurchase: scenario.purchase });
    await harness.useCase.execute({
      inventoryId: scenario.purchase.inventoryId,
      purchaseId: scenario.purchase.id,
    });
    assert.equal(harness.updatedStates[0]?.state.stock, scenario.expectedStock);
    assert.equal(
      harness.updatedStates[0]?.state.unitCost?.scaledUnits,
      scenario.expectedCost,
    );
  });
}

test('restores an unknown previous cost as null', async () => {
  const purchase = purchaseFixture({
    quantity: 3,
    unitCost: Money.fromDecimal('12'),
    totalAmount: Money.fromDecimal('36'),
    stockBefore: -3,
    stockAfter: 0,
    averageCostBefore: null,
    averageCostAfter: Money.fromDecimal('12'),
  });
  const harness = createHarness({ storedPurchase: purchase });
  await harness.useCase.execute({
    inventoryId: purchase.inventoryId,
    purchaseId: purchase.id,
  });
  assert.equal(harness.updatedStates[0]?.state.unitCost, null);
});

test('restores a known zero previous cost without converting it to null', async () => {
  const purchase = purchaseFixture({
    averageCostBefore: Money.zero(),
    averageCostAfter: Money.fromDecimal('10'),
  });
  const harness = createHarness({ storedPurchase: purchase });
  await harness.useCase.execute({
    inventoryId: purchase.inventoryId,
    purchaseId: purchase.id,
  });
  assert.equal(harness.updatedStates[0]?.state.unitCost?.scaledUnits, 0);
});

test('does not read or update Product, so archived and changed prices do not block', async () => {
  const harness = createHarness();
  await harness.useCase.execute({
    inventoryId: 'inventory-1',
    purchaseId: 'purchase-1',
  });
  assert.equal(
    harness.events.some((event) => event.startsWith('product:')),
    false,
  );
});

test('returns ALREADY_VOIDED without dependent reads, writes, IDs, or clock', async () => {
  const purchase = purchaseFixture({ status: 'VOIDED', updatedAt: VOIDED_AT });
  const harness = createHarness({ storedPurchase: purchase });
  const result = await harness.useCase.execute({
    inventoryId: purchase.inventoryId,
    purchaseId: purchase.id,
  });

  assert.equal(result.kind, 'ALREADY_VOIDED');
  assert.deepEqual(harness.events, ['purchase:find']);
  assert.equal(harness.ids.calls, 0);
  assert.equal(harness.clock.calls, 0);
});

for (const type of [
  'SALE',
  'PURCHASE',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'REVERSAL',
] as const satisfies readonly InventoryMovementType[]) {
  test(`a later ${type} movement makes the Purchase not eligible`, async () => {
    const purchase = purchaseFixture();
    const original = movementFixture(purchase);
    const delta = type === 'SALE' || type === 'ADJUSTMENT_OUT' ? -1 : 1;
    const later = createInventoryMovement({
      id: `later-${type}`,
      inventoryId: purchase.inventoryId,
      productId: purchase.productId,
      type,
      quantityDelta: delta,
      unitCostSnapshot: purchase.averageCostAfter,
      stockBefore: purchase.stockAfter,
      stockAfter: purchase.stockAfter + delta,
      sourceType: type === 'REVERSAL' ? 'INVENTORY_MOVEMENT' : type,
      sourceId: type === 'REVERSAL' ? 'unrelated' : 'other-operation',
      metadata: null,
      effectiveAt: PURCHASE_AT + 1,
      createdAt: PURCHASE_AT + 1,
      updatedAt: PURCHASE_AT + 1,
    });
    const harness = createHarness({
      storedPurchase: purchase,
      originals: [original],
      otherMovements: [original, later],
    });
    const result = await harness.useCase.execute({
      inventoryId: purchase.inventoryId,
      purchaseId: purchase.id,
    });
    assert.equal(result.kind, 'NOT_ELIGIBLE');
    assert.equal(harness.savedReversals.length, 0);
  });
}

test('another movement at the same timestamp is conservatively not eligible', async () => {
  const purchase = purchaseFixture();
  const original = movementFixture(purchase);
  const tied = createInventoryMovement({
    ...original,
    id: 'tied-movement',
    type: 'SALE',
    quantityDelta: -1,
    stockBefore: purchase.stockAfter,
    stockAfter: purchase.stockAfter - 1,
    sourceType: 'SALE',
    sourceId: 'sale-1',
  });
  const harness = createHarness({
    storedPurchase: purchase,
    originals: [original],
    otherMovements: [original, tied],
  });
  const result = await harness.useCase.execute({
    inventoryId: purchase.inventoryId,
    purchaseId: purchase.id,
  });
  assert.equal(result.kind, 'NOT_ELIGIBLE');
});

test('the original movement itself is not timestamp ambiguity', async () => {
  const harness = createHarness();
  const result = await harness.useCase.execute({
    inventoryId: 'inventory-1',
    purchaseId: 'purchase-1',
  });
  assert.equal(result.kind, 'VOIDED');
});

for (const count of [1, 2]) {
  test(`a confirmed Purchase with ${count} existing REVERSAL record(s) is inconsistent`, async () => {
    const purchase = purchaseFixture();
    const original = movementFixture(purchase);
    const reversals = Array.from({ length: count }, (_, index) =>
      createInventoryMovement({
        id: `existing-reversal-${index}`,
        inventoryId: purchase.inventoryId,
        productId: purchase.productId,
        type: 'REVERSAL',
        quantityDelta: -purchase.quantity,
        unitCostSnapshot: purchase.unitCost,
        stockBefore: purchase.stockAfter,
        stockAfter: purchase.stockBefore,
        sourceType: 'INVENTORY_MOVEMENT',
        sourceId: original.id,
        metadata: null,
        effectiveAt: VOIDED_AT,
        createdAt: VOIDED_AT,
        updatedAt: VOIDED_AT,
      }),
    );
    const harness = createHarness({
      storedPurchase: purchase,
      originals: [original],
      reversals,
    });
    await assert.rejects(
      () =>
        harness.useCase.execute({
          inventoryId: purchase.inventoryId,
          purchaseId: purchase.id,
        }),
      ConfirmedPurchaseHasReversalError,
    );
    assert.equal(harness.savedReversals.length, 0);
  });
}

for (const originals of [
  [],
  [
    movementFixture(purchaseFixture()),
    movementFixture(purchaseFixture(), { id: 'movement-2' }),
  ],
] as const) {
  test(`requires exactly one original PURCHASE movement (${originals.length} found)`, async () => {
    const harness = createHarness({ originals });
    await assert.rejects(
      () =>
        harness.useCase.execute({
          inventoryId: 'inventory-1',
          purchaseId: 'purchase-1',
        }),
      PurchaseVoidInconsistentDataError,
    );
    assert.equal(harness.savedReversals.length, 0);
  });
}

test('current stock mismatch returns NOT_ELIGIBLE without writes', async () => {
  const harness = createHarness({
    state: createInventoryState({
      stock: 21,
      unitCost: Money.fromDecimal('15'),
    }),
  });
  const result = await harness.useCase.execute({
    inventoryId: 'inventory-1',
    purchaseId: 'purchase-1',
  });
  assert.equal(result.kind, 'NOT_ELIGIBLE');
  assert.equal(harness.savedReversals.length, 0);
});

for (const state of [
  createInventoryState({ stock: 20, unitCost: Money.fromDecimal('15.000001') }),
  createInventoryState({ stock: 20, unitCost: Money.zero() }),
] as const) {
  test('current cost mismatch returns NOT_ELIGIBLE without writes', async () => {
    const harness = createHarness({ state });
    const result = await harness.useCase.execute({
      inventoryId: 'inventory-1',
      purchaseId: 'purchase-1',
    });
    assert.equal(result.kind, 'NOT_ELIGIBLE');
    assert.equal(harness.savedReversals.length, 0);
  });
}

test('null current cost does not equal a known post-purchase cost', async () => {
  const purchase = purchaseFixture({
    quantity: 3,
    unitCost: Money.fromDecimal('12'),
    totalAmount: Money.fromDecimal('36'),
    stockBefore: -10,
    stockAfter: -7,
    averageCostBefore: null,
    averageCostAfter: Money.fromDecimal('12'),
  });
  const harness = createHarness({
    storedPurchase: purchase,
    state: createInventoryState({ stock: -7, unitCost: null }),
  });
  const result = await harness.useCase.execute({
    inventoryId: purchase.inventoryId,
    purchaseId: purchase.id,
  });
  assert.equal(result.kind, 'NOT_ELIGIBLE');
});

test('missing or cross-inventory Purchase uses the not-found error pattern', async () => {
  const harness = createHarness();
  await assert.rejects(
    () =>
      harness.useCase.execute({
        inventoryId: 'inventory-2',
        purchaseId: 'purchase-1',
      }),
    PurchaseNotFoundError,
  );
});

test('REVERSAL ID and shared timestamp come from central dependencies', async () => {
  const harness = createHarness();
  await harness.useCase.execute({
    inventoryId: 'inventory-1',
    purchaseId: 'purchase-1',
  });
  assert.equal(harness.ids.calls, 1);
  assert.equal(harness.clock.calls, 1);
  assert.equal(harness.savedReversals[0]?.id, 'reversal-1');
  assert.equal(harness.savedReversals[0]?.createdAt, VOIDED_AT);
  assert.equal(harness.savedReversals[0]?.effectiveAt, VOIDED_AT);
  assert.equal(harness.updatedPurchases[0]?.updatedAt, VOIDED_AT);
});

for (const failure of ['reversal', 'state', 'purchase'] as const) {
  test(`${failure} write failures propagate from the single transaction`, async () => {
    const harness = createHarness({ failWrite: failure });
    await assert.rejects(
      () =>
        harness.useCase.execute({
          inventoryId: 'inventory-1',
          purchaseId: 'purchase-1',
        }),
      new RegExp(`${failure} failed`),
    );
    assert.equal(harness.transactionManager.calls, 1);
  });
}
