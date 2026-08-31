import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInventoryMovement,
  createInventoryState,
  createSale,
  createSaleItem,
  Money,
  type InventoryMovement,
  type InventoryMovementType,
  type Sale,
  type SaleItem,
} from '@stock-app/domain';

import {
  ConfirmedSaleHasReversalError,
  SaleNotFoundError,
  SaleVoidInconsistentDataError,
  VoidSaleUseCase,
  type Clock,
  type InventoryMovementIdGenerator,
  type SaleVoidRepository,
  type TransactionManager,
  type TransactionRepositories,
} from '../src/index';
import { unusedPurchaseVoidRepository } from './support/unused-sale-void-repository';

const SALE_AT = 1_776_444_000_000;
const VOIDED_AT = SALE_AT + 1_000;

function sale(status: Sale['status'] = 'CONFIRMED'): Sale {
  return createSale({
    id: 'sale-1',
    inventoryId: 'inventory-1',
    effectiveAt: SALE_AT,
    createdAt: SALE_AT,
    updatedAt: status === 'VOIDED' ? VOIDED_AT : SALE_AT,
    status,
    totalAmount: Money.fromDecimal('6'),
    estimatedCost: Money.fromDecimal('3'),
    estimatedProfit: Money.fromDecimal('3'),
    notes: null,
  });
}

function item(productId: string, quantity = 2): SaleItem {
  return createSaleItem({
    id: `item-${productId}`,
    saleId: 'sale-1',
    productId,
    quantity,
    unitSalePrice: Money.fromDecimal('3'),
    subtotal: Money.fromDecimal(String(quantity * 3)),
    unitCostSnapshot: Money.fromDecimal('1.5'),
    estimatedCost: Money.fromDecimal(String(quantity * 1.5)),
    estimatedProfit: Money.fromDecimal(String(quantity * 1.5)),
    costStatus: 'KNOWN',
    createdAt: SALE_AT,
    updatedAt: SALE_AT,
  });
}

function unknownCostItem(productId: string, quantity = 2): SaleItem {
  return createSaleItem({
    id: `item-${productId}`,
    saleId: 'sale-1',
    productId,
    quantity,
    unitSalePrice: Money.fromDecimal('3'),
    subtotal: Money.fromDecimal(String(quantity * 3)),
    unitCostSnapshot: null,
    estimatedCost: null,
    estimatedProfit: null,
    costStatus: 'UNKNOWN',
    createdAt: SALE_AT,
    updatedAt: SALE_AT,
  });
}

function movement(
  id: string,
  productId: string,
  input: {
    type?: InventoryMovementType;
    quantityDelta?: number;
    stockBefore?: number;
    createdAt?: number;
    sourceType?: string;
    sourceId?: string;
  } = {},
): InventoryMovement {
  const type = input.type ?? 'SALE';
  const quantityDelta = input.quantityDelta ?? -2;
  const stockBefore = input.stockBefore ?? 5;
  const createdAt = input.createdAt ?? SALE_AT;

  return createInventoryMovement({
    id,
    inventoryId: 'inventory-1',
    productId,
    type,
    quantityDelta,
    unitCostSnapshot: Money.fromDecimal('1.5'),
    stockBefore,
    stockAfter: stockBefore + quantityDelta,
    sourceType: input.sourceType ?? (type === 'SALE' ? 'SALE' : 'PURCHASE'),
    sourceId: input.sourceId ?? (type === 'SALE' ? 'sale-1' : 'other-1'),
    metadata: null,
    effectiveAt: createdAt,
    createdAt,
    updatedAt: createdAt,
  });
}

interface HarnessOptions {
  readonly storedSale?: Sale | null;
  readonly items?: readonly SaleItem[];
  readonly originals?: readonly InventoryMovement[];
  readonly reversals?: readonly InventoryMovement[];
  readonly otherMovements?: Readonly<
    Record<string, readonly InventoryMovement[]>
  >;
  readonly states?: ReturnType<typeof createInventoryState>[];
  readonly failWrite?: 'reversal' | 'state' | 'sale';
}

function createHarness(options: HarnessOptions = {}) {
  const storedSale =
    options.storedSale === undefined ? sale() : options.storedSale;
  const items = options.items ?? [item('product-a')];
  const originals = options.originals ?? [
    movement('sale-movement-a', 'product-a'),
  ];
  const states = options.states ?? [
    createInventoryState({ stock: 3, unitCost: Money.fromDecimal('1.5') }),
  ];
  const events: string[] = [];
  const savedReversals: InventoryMovement[] = [];
  const updatedStates: Parameters<
    SaleVoidRepository['updateInventoryState']
  >[0][] = [];
  const updatedSales: Sale[] = [];
  let transactionActive = false;
  const transaction: SaleVoidRepository = {
    async findSale(inventoryId, saleId) {
      events.push('sale:find');
      return storedSale?.inventoryId === inventoryId && storedSale.id === saleId
        ? storedSale
        : null;
    },
    async listSaleItems() {
      events.push('items:list');
      return items;
    },
    async listOriginalSaleMovements() {
      events.push('originals:list');
      return originals;
    },
    async listReversals() {
      events.push('reversals:list');
      return options.reversals ?? [];
    },
    async listProductMovementsAtOrAfter({ productId }) {
      events.push(`movements:list:${productId}`);
      return (
        options.otherMovements?.[productId] ??
        originals.filter((candidate) => candidate.productId === productId)
      );
    },
    async listInventoryStates() {
      events.push('states:list');
      return originals.map((original, index) => ({
        inventoryId: 'inventory-1',
        productId: original.productId,
        state:
          states[index] ??
          createInventoryState({
            stock: original.stockAfter,
            unitCost: original.unitCostSnapshot,
          }),
      }));
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
    async updateSale(value) {
      assert.equal(transactionActive, true);
      events.push('sale:update');
      if (options.failWrite === 'sale') throw new Error('sale failed');
      updatedSales.push(value);
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
    saleVoidRepository: transaction,
    purchaseVoidRepository: unusedPurchaseVoidRepository,
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
  const useCase = new VoidSaleUseCase({
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
    updatedSales,
    transactionManager,
  };
}

test('voids an eligible confirmed Sale atomically', async () => {
  const harness = createHarness();
  const result = await harness.useCase.execute({
    inventoryId: 'inventory-1',
    saleId: 'sale-1',
  });

  assert.equal(result.kind, 'VOIDED');
  assert.equal(result.sale.status, 'VOIDED');
  assert.equal(harness.savedReversals.length, 1);
  assert.equal(harness.updatedStates[0]?.state.stock, 5);
  assert.equal(harness.updatedSales[0]?.status, 'VOIDED');
  assert.deepEqual(harness.events.slice(-3), [
    'reversal:save',
    'state:update',
    'sale:update',
  ]);
});

for (const count of [2, 3]) {
  test(`voids all ${count} products in one complete plan`, async () => {
    const productIds = ['product-a', 'product-b', 'product-c'].slice(0, count);
    const originals = productIds.map((productId, index) =>
      movement(`movement-${productId}`, productId, { stockBefore: 5 + index }),
    );
    const harness = createHarness({
      items: productIds.map((productId) => item(productId)),
      originals,
      states: originals.map((original) =>
        createInventoryState({
          stock: original.stockAfter,
          unitCost: original.unitCostSnapshot,
        }),
      ),
    });

    const result = await harness.useCase.execute({
      inventoryId: 'inventory-1',
      saleId: 'sale-1',
    });
    assert.equal(result.kind, 'VOIDED');
    assert.equal(harness.savedReversals.length, count);
    assert.equal(harness.updatedStates.length, count);
  });
}

test('restores stock after a Sale that crossed below zero', async () => {
  const original = movement('movement-negative', 'product-a', {
    quantityDelta: -3,
    stockBefore: 1,
  });
  const harness = createHarness({
    items: [item('product-a', 3)],
    originals: [original],
    states: [
      createInventoryState({ stock: -2, unitCost: Money.fromDecimal('1.5') }),
    ],
  });

  await harness.useCase.execute({
    inventoryId: 'inventory-1',
    saleId: 'sale-1',
  });
  assert.equal(harness.updatedStates[0]?.state.stock, 1);
  assert.equal(harness.savedReversals[0]?.quantityDelta, 3);
});

test('preserves a known zero cost in the reversal and InventoryState', async () => {
  const original = createInventoryMovement({
    ...movement('movement-zero', 'product-a'),
    unitCostSnapshot: Money.zero(),
  });
  const knownZeroItem = createSaleItem({
    ...item('product-a'),
    unitCostSnapshot: Money.zero(),
    estimatedCost: Money.zero(),
    estimatedProfit: Money.fromDecimal('6'),
  });
  const harness = createHarness({
    items: [knownZeroItem],
    originals: [original],
    states: [createInventoryState({ stock: 3, unitCost: Money.zero() })],
  });

  await harness.useCase.execute({
    inventoryId: 'inventory-1',
    saleId: 'sale-1',
  });
  assert.equal(harness.savedReversals[0]?.unitCostSnapshot?.scaledUnits, 0);
  assert.equal(harness.updatedStates[0]?.state.unitCost?.scaledUnits, 0);
});

test('preserves an unknown cost as null while restoring negative stock', async () => {
  const original = createInventoryMovement({
    ...movement('movement-unknown', 'product-a', { stockBefore: 0 }),
    unitCostSnapshot: null,
  });
  const harness = createHarness({
    items: [unknownCostItem('product-a')],
    originals: [original],
    states: [createInventoryState({ stock: -2, unitCost: null })],
  });

  await harness.useCase.execute({
    inventoryId: 'inventory-1',
    saleId: 'sale-1',
  });
  assert.equal(harness.savedReversals[0]?.unitCostSnapshot, null);
  assert.equal(harness.updatedStates[0]?.state.unitCost, null);
  assert.equal(harness.updatedStates[0]?.state.stock, 0);
});

test('does not consult current Product archived state when voiding historical data', async () => {
  const harness = createHarness();
  const result = await harness.useCase.execute({
    inventoryId: 'inventory-1',
    saleId: 'sale-1',
  });
  assert.equal(result.kind, 'VOIDED');
  assert.equal(
    harness.events.some((event) => event.startsWith('product:')),
    false,
  );
});

test('returns ALREADY_VOIDED without reading dependent records or writing', async () => {
  const harness = createHarness({ storedSale: sale('VOIDED') });
  const result = await harness.useCase.execute({
    inventoryId: 'inventory-1',
    saleId: 'sale-1',
  });

  assert.equal(result.kind, 'ALREADY_VOIDED');
  assert.deepEqual(harness.events, ['sale:find']);
  assert.equal(harness.ids.calls, 0);
  assert.equal(harness.clock.calls, 0);
});

for (const type of [
  'SALE',
  'PURCHASE',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'REVERSAL',
] as const) {
  test(`a later ${type} movement makes the complete Sale not eligible`, async () => {
    const original = movement('original', 'product-a');
    const later = movement(`later-${type}`, 'product-a', {
      type,
      quantityDelta: type === 'SALE' || type === 'ADJUSTMENT_OUT' ? -1 : 1,
      stockBefore: 3,
      createdAt: SALE_AT + 1,
      sourceType: type === 'REVERSAL' ? 'INVENTORY_MOVEMENT' : type,
      sourceId: type === 'REVERSAL' ? 'unrelated-movement' : 'other-operation',
    });
    const harness = createHarness({
      originals: [original],
      otherMovements: { 'product-a': [original, later] },
    });

    const result = await harness.useCase.execute({
      inventoryId: 'inventory-1',
      saleId: 'sale-1',
    });
    assert.deepEqual(result.kind, 'NOT_ELIGIBLE');
    assert.equal(harness.savedReversals.length, 0);
  });
}

test('another movement at the same timestamp is conservatively not eligible', async () => {
  const original = movement('original', 'product-a');
  const tied = movement('tied', 'product-a', {
    type: 'PURCHASE',
    quantityDelta: 1,
    stockBefore: 3,
  });
  const harness = createHarness({
    otherMovements: { 'product-a': [original, tied] },
    originals: [original],
  });

  const result = await harness.useCase.execute({
    inventoryId: 'inventory-1',
    saleId: 'sale-1',
  });
  assert.equal(result.kind, 'NOT_ELIGIBLE');
});

test('one later movement blocks every product in a multi-product Sale before writes', async () => {
  const originals = [
    movement('movement-a', 'product-a'),
    movement('movement-b', 'product-b'),
    movement('movement-c', 'product-c'),
  ];
  const later = movement('later-c', 'product-c', {
    type: 'PURCHASE',
    quantityDelta: 1,
    stockBefore: 3,
    createdAt: SALE_AT + 1,
  });
  const harness = createHarness({
    items: ['product-a', 'product-b', 'product-c'].map((id) => item(id)),
    originals,
    states: originals.map((original) =>
      createInventoryState({
        stock: original.stockAfter,
        unitCost: original.unitCostSnapshot,
      }),
    ),
    otherMovements: {
      'product-a': [originals[0]!],
      'product-b': [originals[1]!],
      'product-c': [originals[2]!, later],
    },
  });

  const result = await harness.useCase.execute({
    inventoryId: 'inventory-1',
    saleId: 'sale-1',
  });
  assert.equal(result.kind, 'NOT_ELIGIBLE');
  assert.equal(harness.savedReversals.length, 0);
  assert.equal(harness.updatedStates.length, 0);
  assert.equal(harness.updatedSales.length, 0);
});

test('the original movement itself is not timestamp ambiguity', async () => {
  const harness = createHarness();
  const result = await harness.useCase.execute({
    inventoryId: 'inventory-1',
    saleId: 'sale-1',
  });
  assert.equal(result.kind, 'VOIDED');
});

test('a confirmed Sale with an existing REVERSAL is controlled inconsistency', async () => {
  const original = movement('original', 'product-a');
  const reversal = movement('existing-reversal', 'product-a', {
    type: 'REVERSAL',
    quantityDelta: 2,
    stockBefore: 3,
    sourceType: 'INVENTORY_MOVEMENT',
    sourceId: original.id,
  });
  const harness = createHarness({
    originals: [original],
    reversals: [reversal],
  });

  await assert.rejects(
    () =>
      harness.useCase.execute({ inventoryId: 'inventory-1', saleId: 'sale-1' }),
    ConfirmedSaleHasReversalError,
  );
  assert.equal(harness.savedReversals.length, 0);
});

test('multiple existing REVERSAL records are controlled inconsistency', async () => {
  const original = movement('original', 'product-a');
  const reversals = ['a', 'b'].map((id) =>
    movement(`reversal-${id}`, 'product-a', {
      type: 'REVERSAL',
      quantityDelta: 2,
      stockBefore: 3,
      sourceType: 'INVENTORY_MOVEMENT',
      sourceId: original.id,
    }),
  );
  const harness = createHarness({ originals: [original], reversals });

  await assert.rejects(
    () =>
      harness.useCase.execute({ inventoryId: 'inventory-1', saleId: 'sale-1' }),
    ConfirmedSaleHasReversalError,
  );
});

test('missing original movement is reported as inconsistent without writes', async () => {
  const harness = createHarness({ originals: [] });
  await assert.rejects(
    () =>
      harness.useCase.execute({ inventoryId: 'inventory-1', saleId: 'sale-1' }),
    SaleVoidInconsistentDataError,
  );
  assert.equal(harness.savedReversals.length, 0);
});

test('current InventoryState mismatch returns NOT_ELIGIBLE', async () => {
  const harness = createHarness({
    states: [
      createInventoryState({ stock: 99, unitCost: Money.fromDecimal('1.5') }),
    ],
  });
  const result = await harness.useCase.execute({
    inventoryId: 'inventory-1',
    saleId: 'sale-1',
  });
  assert.equal(result.kind, 'NOT_ELIGIBLE');
  assert.equal(harness.savedReversals.length, 0);
});

test('missing or cross-inventory Sale uses the not-found error pattern', async () => {
  const harness = createHarness({ storedSale: null });
  await assert.rejects(
    () =>
      harness.useCase.execute({ inventoryId: 'inventory-2', saleId: 'sale-1' }),
    SaleNotFoundError,
  );
});

test('REVERSAL IDs and the shared operation timestamp come from central dependencies', async () => {
  const harness = createHarness();
  await harness.useCase.execute({
    inventoryId: 'inventory-1',
    saleId: 'sale-1',
  });
  assert.equal(harness.ids.calls, 1);
  assert.equal(harness.clock.calls, 1);
  assert.equal(harness.savedReversals[0]?.id, 'reversal-1');
  assert.equal(harness.savedReversals[0]?.createdAt, VOIDED_AT);
  assert.equal(harness.savedReversals[0]?.effectiveAt, VOIDED_AT);
  assert.equal(harness.updatedSales[0]?.updatedAt, VOIDED_AT);
});

for (const failure of ['reversal', 'state', 'sale'] as const) {
  test(`${failure} write failures propagate from the single transaction`, async () => {
    const harness = createHarness({ failWrite: failure });
    await assert.rejects(
      () =>
        harness.useCase.execute({
          inventoryId: 'inventory-1',
          saleId: 'sale-1',
        }),
      new RegExp(`${failure} failed`),
    );
    assert.equal(harness.transactionManager.calls, 1);
  });
}
