import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInventoryMovement,
  createInventoryState,
  createSale,
  createSaleItem,
  Money,
  prepareSaleReversal,
  type InventoryMovement,
  type InventoryState,
  type Sale,
  type SaleItem,
} from '../src/index';

const CREATED_AT = 1_776_444_000_000;
const VOIDED_AT = CREATED_AT + 60_000;

interface SaleLineFixture {
  readonly item: SaleItem;
  readonly movement: InventoryMovement;
  readonly currentState: InventoryState;
}

function saleFixture(
  overrides: Partial<Parameters<typeof createSale>[0]> = {},
): Sale {
  return createSale({
    id: 'sale-1',
    inventoryId: 'inventory-1',
    effectiveAt: CREATED_AT,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    status: 'CONFIRMED',
    totalAmount: Money.fromDecimal('6'),
    estimatedCost: Money.fromDecimal('3'),
    estimatedProfit: Money.fromDecimal('3'),
    notes: null,
    ...overrides,
  });
}

function lineFixture({
  saleId = 'sale-1',
  inventoryId = 'inventory-1',
  itemId = 'item-1',
  movementId = 'movement-1',
  productId = 'product-1',
  quantity = 3,
  stockBefore = 10,
  unitCost = Money.fromDecimal('1'),
  unitSalePrice = Money.fromDecimal('2'),
}: {
  readonly saleId?: string;
  readonly inventoryId?: string;
  readonly itemId?: string;
  readonly movementId?: string;
  readonly productId?: string;
  readonly quantity?: number;
  readonly stockBefore?: number;
  readonly unitCost?: Money | null;
  readonly unitSalePrice?: Money;
} = {}): SaleLineFixture {
  const stockAfter = stockBefore - quantity;
  const subtotal = unitSalePrice.multiplyByInteger(quantity);
  const estimatedCost =
    unitCost === null ? null : unitCost.multiplyByInteger(quantity);
  const estimatedProfit =
    estimatedCost === null ? null : subtotal.subtract(estimatedCost);

  return {
    item: createSaleItem({
      id: itemId,
      saleId,
      productId,
      quantity,
      unitSalePrice,
      subtotal,
      unitCostSnapshot: unitCost,
      estimatedCost,
      estimatedProfit,
      costStatus: unitCost === null ? 'UNKNOWN' : 'KNOWN',
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    }),
    movement: createInventoryMovement({
      id: movementId,
      inventoryId,
      productId,
      type: 'SALE',
      quantityDelta: -quantity,
      unitCostSnapshot: unitCost,
      stockBefore,
      stockAfter,
      sourceType: 'SALE',
      sourceId: saleId,
      metadata: null,
      effectiveAt: CREATED_AT,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    }),
    currentState: createInventoryState({ stock: stockAfter, unitCost }),
  };
}

function prepare(
  sale: Sale,
  lines: readonly SaleLineFixture[],
  voidedAt = VOIDED_AT,
) {
  return prepareSaleReversal({
    sale,
    saleItems: lines.map(({ item }) => item),
    originalMovements: lines.map(({ movement }) => movement),
    currentInventoryStates: lines.map(({ movement, currentState }) => ({
      productId: movement.productId,
      state: currentState,
    })),
    voidedAt,
  });
}

test('prepares the CONFIRMED to VOIDED Sale transition', () => {
  const sale = saleFixture();
  const result = prepare(sale, [lineFixture()]);

  assert.equal(result.kind, 'VOID_PREPARED');
  assert.equal(result.sale.status, 'VOIDED');
  assert.equal(result.sale.updatedAt, VOIDED_AT);
  assert.equal(result.sale.effectiveAt, sale.effectiveAt);
  assert.equal(result.sale.createdAt, sale.createdAt);
  assert.equal(sale.status, 'CONFIRMED');
});

test('returns an empty idempotent result for an already VOIDED Sale', () => {
  const sale = saleFixture({ status: 'VOIDED', updatedAt: VOIDED_AT });
  const result = prepareSaleReversal({
    sale,
    saleItems: [],
    originalMovements: [],
    currentInventoryStates: [],
    voidedAt: VOIDED_AT + 1,
  });

  assert.equal(result.kind, 'ALREADY_VOIDED');
  assert.strictEqual(result.sale, sale);
  assert.deepEqual(result.reversals, []);
  assert.deepEqual(result.inventoryStateUpdates, []);
});

test('prepares a simple Sale reversal that restores stock', () => {
  const result = prepare(saleFixture(), [lineFixture()]);

  assert.equal(result.reversals.length, 1);
  assert.equal(result.reversals[0]?.movement.quantityDelta, 3);
  assert.equal(result.reversals[0]?.movement.stockBefore, 7);
  assert.equal(result.reversals[0]?.movement.stockAfter, 10);
  assert.equal(result.inventoryStateUpdates[0]?.state.stock, 10);
});

test('restores stock when the Sale ended with negative inventory', () => {
  const result = prepare(saleFixture(), [
    lineFixture({ stockBefore: 1, quantity: 3 }),
  ]);

  assert.equal(result.reversals[0]?.movement.stockBefore, -2);
  assert.equal(result.reversals[0]?.movement.stockAfter, 1);
  assert.equal(result.inventoryStateUpdates[0]?.state.stock, 1);
});

for (const [name, unitCost] of [
  ['known cost', Money.fromDecimal('1.25')],
  ['known zero cost', Money.zero()],
  ['unknown cost', null],
] as const) {
  test(`preserves ${name} in the resulting InventoryState`, () => {
    const line = lineFixture({
      unitCost,
      ...(unitCost === null ? { stockBefore: 0 } : {}),
    });
    const result = prepare(saleFixture(), [line]);

    assert.strictEqual(
      result.inventoryStateUpdates[0]?.state.unitCost,
      unitCost,
    );
  });
}

test('copies the original cost snapshot and references the original movement', () => {
  const line = lineFixture({ unitCost: Money.fromDecimal('1.25') });
  const result = prepare(saleFixture(), [line]);
  const reversal = result.reversals[0];

  assert.equal(reversal?.originalMovementId, line.movement.id);
  assert.equal(reversal?.productId, line.movement.productId);
  assert.equal(reversal?.movement.type, 'REVERSAL');
  assert.equal(reversal?.movement.sourceType, 'INVENTORY_MOVEMENT');
  assert.equal(reversal?.movement.sourceId, line.movement.id);
  assert.strictEqual(
    reversal?.movement.unitCostSnapshot,
    line.movement.unitCostSnapshot,
  );
});

test('prepares exactly one reversal for each of two products', () => {
  const lines = [
    lineFixture(),
    lineFixture({
      itemId: 'item-2',
      movementId: 'movement-2',
      productId: 'product-2',
      quantity: 2,
      stockBefore: 4,
    }),
  ];
  const result = prepare(saleFixture(), lines);

  assert.equal(result.reversals.length, 2);
  assert.deepEqual(
    result.reversals.map(({ productId }) => productId),
    ['product-1', 'product-2'],
  );
  assert.deepEqual(
    result.inventoryStateUpdates.map(({ state }) => state.stock),
    [10, 4],
  );
});

test('prepares exactly one reversal for each of three products', () => {
  const lines = [
    lineFixture(),
    lineFixture({
      itemId: 'item-2',
      movementId: 'movement-2',
      productId: 'product-2',
      stockBefore: 8,
    }),
    lineFixture({
      itemId: 'item-3',
      movementId: 'movement-3',
      productId: 'product-3',
      stockBefore: 1,
    }),
  ];
  const result = prepare(saleFixture(), lines);

  assert.equal(result.reversals.length, 3);
  assert.equal(result.inventoryStateUpdates.length, 3);
});

test('fails the whole plan when one line has a mismatched current state', () => {
  const first = lineFixture();
  const second = lineFixture({
    itemId: 'item-2',
    movementId: 'movement-2',
    productId: 'product-2',
  });

  assert.throws(
    () =>
      prepareSaleReversal({
        sale: saleFixture(),
        saleItems: [first.item, second.item],
        originalMovements: [first.movement, second.movement],
        currentInventoryStates: [
          { productId: first.movement.productId, state: first.currentState },
          {
            productId: second.movement.productId,
            state: createInventoryState({
              stock: second.currentState.stock - 1,
              unitCost: second.currentState.unitCost,
            }),
          },
        ],
        voidedAt: VOIDED_AT,
      }),
    /current inventory state.*movement/i,
  );
});

test('rejects a duplicated original movement', () => {
  const line = lineFixture();

  assert.throws(
    () =>
      prepareSaleReversal({
        sale: saleFixture(),
        saleItems: [line.item],
        originalMovements: [line.movement, line.movement],
        currentInventoryStates: [
          { productId: line.movement.productId, state: line.currentState },
        ],
        voidedAt: VOIDED_AT,
      }),
    /duplicate.*movement/i,
  );
});

test('rejects a movement owned by another Sale', () => {
  const line = lineFixture({ saleId: 'sale-2' });

  assert.throws(() => prepare(saleFixture(), [line]), /movement.*sale/i);
});

test('rejects a movement owned by another Inventory', () => {
  const line = lineFixture({ inventoryId: 'inventory-2' });

  assert.throws(() => prepare(saleFixture(), [line]), /movement.*inventory/i);
});

for (const type of ['PURCHASE', 'ADJUSTMENT_IN', 'REVERSAL'] as const) {
  test(`rejects ${type} as an original Sale movement`, () => {
    const line = lineFixture();
    const movement = createInventoryMovement({
      ...line.movement,
      type,
    });

    assert.throws(
      () => prepare(saleFixture(), [{ ...line, movement }]),
      /original movement.*SALE/i,
    );
  });
}

test('rejects a SALE movement with a positive quantity delta', () => {
  const line = lineFixture();
  const movement = createInventoryMovement({
    ...line.movement,
    quantityDelta: 3,
    stockBefore: 7,
    stockAfter: 10,
  });

  assert.throws(
    () => prepare(saleFixture(), [{ ...line, movement }]),
    /sale movement.*negative/i,
  );
});

test('rejects inconsistent original stock snapshots', () => {
  const line = lineFixture();
  const movement: InventoryMovement = Object.freeze({
    ...line.movement,
    stockAfter: line.movement.stockAfter + 1,
  });

  assert.throws(
    () => prepare(saleFixture(), [{ ...line, movement }]),
    /stock after.*quantity delta/i,
  );
});

test('rejects current stock that differs from original stockAfter', () => {
  const line = lineFixture();

  assert.throws(
    () =>
      prepareSaleReversal({
        sale: saleFixture(),
        saleItems: [line.item],
        originalMovements: [line.movement],
        currentInventoryStates: [
          {
            productId: line.movement.productId,
            state: createInventoryState({
              stock: line.currentState.stock + 1,
              unitCost: line.currentState.unitCost,
            }),
          },
        ],
        voidedAt: VOIDED_AT,
      }),
    /current inventory state.*movement/i,
  );
});

test('rejects current cost that differs from the Sale movement snapshot', () => {
  const line = lineFixture();

  assert.throws(
    () =>
      prepareSaleReversal({
        sale: saleFixture(),
        saleItems: [line.item],
        originalMovements: [line.movement],
        currentInventoryStates: [
          {
            productId: line.movement.productId,
            state: createInventoryState({
              stock: line.currentState.stock,
              unitCost: Money.fromDecimal('2'),
            }),
          },
        ],
        voidedAt: VOIDED_AT,
      }),
    /current inventory state.*movement/i,
  );
});

test('rejects a confirmed Sale without movements', () => {
  assert.throws(() => prepare(saleFixture(), []), /confirmed sale.*movement/i);
});

test('rejects a missing movement for a SaleItem', () => {
  const first = lineFixture();
  const second = lineFixture({
    itemId: 'item-2',
    movementId: 'movement-2',
    productId: 'product-2',
  });

  assert.throws(
    () =>
      prepareSaleReversal({
        sale: saleFixture(),
        saleItems: [first.item, second.item],
        originalMovements: [first.movement],
        currentInventoryStates: [
          { productId: first.movement.productId, state: first.currentState },
          { productId: second.movement.productId, state: second.currentState },
        ],
        voidedAt: VOIDED_AT,
      }),
    /complete.*movement/i,
  );
});

test('rejects an extra movement without a SaleItem', () => {
  const first = lineFixture();
  const second = lineFixture({
    itemId: 'item-2',
    movementId: 'movement-2',
    productId: 'product-2',
  });

  assert.throws(
    () =>
      prepareSaleReversal({
        sale: saleFixture(),
        saleItems: [first.item],
        originalMovements: [first.movement, second.movement],
        currentInventoryStates: [
          { productId: first.movement.productId, state: first.currentState },
          { productId: second.movement.productId, state: second.currentState },
        ],
        voidedAt: VOIDED_AT,
      }),
    /complete.*movement/i,
  );
});

test('rejects an InventoryState missing for a Sale movement', () => {
  const line = lineFixture();

  assert.throws(
    () =>
      prepareSaleReversal({
        sale: saleFixture(),
        saleItems: [line.item],
        originalMovements: [line.movement],
        currentInventoryStates: [],
        voidedAt: VOIDED_AT,
      }),
    /complete.*inventory state/i,
  );
});

test('rejects duplicated current InventoryState product IDs', () => {
  const line = lineFixture();
  const state = {
    productId: line.movement.productId,
    state: line.currentState,
  };

  assert.throws(
    () =>
      prepareSaleReversal({
        sale: saleFixture(),
        saleItems: [line.item],
        originalMovements: [line.movement],
        currentInventoryStates: [state, state],
        voidedAt: VOIDED_AT,
      }),
    /duplicate.*inventory state/i,
  );
});

test('rejects a movement quantity that does not match its SaleItem', () => {
  const line = lineFixture();
  const movement = createInventoryMovement({
    ...line.movement,
    quantityDelta: -2,
    stockAfter: line.movement.stockBefore - 2,
  });
  const currentState = createInventoryState({
    stock: movement.stockAfter,
    unitCost: movement.unitCostSnapshot,
  });

  assert.throws(
    () => prepare(saleFixture(), [{ ...line, movement, currentState }]),
    /quantity.*sale item/i,
  );
});

test('rejects a movement cost snapshot that differs from its SaleItem', () => {
  const line = lineFixture();
  const movement = createInventoryMovement({
    ...line.movement,
    unitCostSnapshot: Money.fromDecimal('2'),
  });
  const currentState = createInventoryState({
    stock: movement.stockAfter,
    unitCost: movement.unitCostSnapshot,
  });

  assert.throws(
    () => prepare(saleFixture(), [{ ...line, movement, currentState }]),
    /cost snapshot.*sale item/i,
  );
});

test('rejects SaleItems owned by another Sale', () => {
  const line = lineFixture({ saleId: 'sale-2' });
  const movement = createInventoryMovement({
    ...line.movement,
    sourceId: 'sale-1',
  });

  assert.throws(
    () => prepare(saleFixture(), [{ ...line, movement }]),
    /sale item.*sale/i,
  );
});

test('rejects duplicate SaleItem products because registration aggregates them', () => {
  const first = lineFixture();
  const second = lineFixture({ itemId: 'item-2', movementId: 'movement-2' });

  assert.throws(
    () =>
      prepareSaleReversal({
        sale: saleFixture(),
        saleItems: [first.item, second.item],
        originalMovements: [first.movement],
        currentInventoryStates: [
          { productId: first.movement.productId, state: first.currentState },
        ],
        voidedAt: VOIDED_AT,
      }),
    /duplicate.*sale item.*product/i,
  );
});

test('supports the safe-integer boundary when negating a Sale delta', () => {
  const quantity = Number.MAX_SAFE_INTEGER;
  const line = lineFixture({
    quantity,
    stockBefore: 0,
    unitCost: null,
    unitSalePrice: Money.fromScaledUnits(1),
  });
  const result = prepare(saleFixture(), [line]);

  assert.equal(result.reversals[0]?.movement.quantityDelta, quantity);
  assert.equal(result.reversals[0]?.movement.stockAfter, 0);
});

test('rejects a void timestamp before the current Sale updatedAt', () => {
  assert.throws(
    () => prepare(saleFixture(), [lineFixture()], CREATED_AT - 1),
    /void timestamp.*updated/i,
  );
});

test('does not mutate the Sale, movements, items, states, or input arrays', () => {
  const sale = saleFixture();
  const line = lineFixture();
  const saleItems = Object.freeze([line.item]);
  const originalMovements = Object.freeze([line.movement]);
  const currentInventoryStates = Object.freeze([
    Object.freeze({
      productId: line.movement.productId,
      state: line.currentState,
    }),
  ]);

  const result = prepareSaleReversal({
    sale,
    saleItems,
    originalMovements,
    currentInventoryStates,
    voidedAt: VOIDED_AT,
  });

  assert.equal(sale.status, 'CONFIRMED');
  assert.equal(line.movement.type, 'SALE');
  assert.equal(line.item.saleId, sale.id);
  assert.equal(line.currentState.stock, 7);
  assert.equal(saleItems.length, 1);
  assert.equal(originalMovements.length, 1);
  assert.equal(currentInventoryStates.length, 1);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.reversals));
  assert.ok(Object.isFrozen(result.inventoryStateUpdates));
  assert.ok(Object.isFrozen(result.reversals[0]));
  assert.ok(Object.isFrozen(result.inventoryStateUpdates[0]));
});
