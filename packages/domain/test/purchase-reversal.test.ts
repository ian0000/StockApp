import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInventoryMovement,
  createInventoryState,
  createPurchase,
  Money,
  preparePurchaseReversal,
  type InventoryMovement,
  type InventoryMovementType,
  type InventoryState,
  type Purchase,
} from '../src/index';

const CREATED_AT = 1_776_444_000_000;
const VOIDED_AT = CREATED_AT + 60_000;

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
    effectiveAt: CREATED_AT,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    status: 'CONFIRMED',
    notes: 'Proveedor habitual',
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
    effectiveAt: CREATED_AT,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  });
}

function currentState(purchase: Purchase): InventoryState {
  return createInventoryState({
    stock: purchase.stockAfter,
    unitCost: purchase.averageCostAfter,
  });
}

function prepare(
  purchase: Purchase,
  originalMovement = movementFixture(purchase),
  state = currentState(purchase),
  voidedAt = VOIDED_AT,
) {
  return preparePurchaseReversal({
    purchase,
    originalMovement,
    currentInventoryState: state,
    voidedAt,
  });
}

test('prepares the CONFIRMED to VOIDED Purchase transition', () => {
  const purchase = purchaseFixture();
  const result = prepare(purchase);

  assert.equal(result.kind, 'VOID_PREPARED');
  assert.equal(result.purchase.status, 'VOIDED');
  assert.equal(result.purchase.updatedAt, VOIDED_AT);
  assert.equal(result.purchase.effectiveAt, purchase.effectiveAt);
  assert.equal(result.purchase.createdAt, purchase.createdAt);
  assert.equal(result.purchase.stockBefore, purchase.stockBefore);
  assert.equal(result.purchase.stockAfter, purchase.stockAfter);
  assert.equal(purchase.status, 'CONFIRMED');
});

test('returns an empty idempotent result for an already VOIDED Purchase', () => {
  const purchase = purchaseFixture({
    status: 'VOIDED',
    updatedAt: VOIDED_AT,
  });
  const result = preparePurchaseReversal({
    purchase,
    originalMovement: movementFixture(purchase),
    currentInventoryState: currentState(purchase),
    voidedAt: CREATED_AT,
  });

  assert.equal(result.kind, 'ALREADY_VOIDED');
  assert.strictEqual(result.purchase, purchase);
  assert.equal(result.purchase.updatedAt, VOIDED_AT);
  assert.deepEqual(result.reversals, []);
  assert.deepEqual(result.inventoryStateUpdates, []);
});

test('restores positive stock and average cost from exact before snapshots', () => {
  const result = prepare(purchaseFixture());

  assert.equal(result.reversals.length, 1);
  assert.equal(result.reversals[0]?.movement.quantityDelta, -10);
  assert.equal(result.reversals[0]?.movement.stockBefore, 20);
  assert.equal(result.reversals[0]?.movement.stockAfter, 10);
  assert.equal(result.inventoryStateUpdates[0]?.state.stock, 10);
  assert.equal(
    result.inventoryStateUpdates[0]?.state.unitCost?.scaledUnits,
    Money.fromDecimal('10').scaledUnits,
  );
});

test('restores zero stock and its known historical cost exactly', () => {
  const previousCost = Money.fromDecimal('7.25');
  const unitCost = Money.fromDecimal('12');
  const purchase = purchaseFixture({
    quantity: 10,
    unitCost,
    totalAmount: Money.fromDecimal('120'),
    averageCostBefore: previousCost,
    averageCostAfter: unitCost,
    stockBefore: 0,
    stockAfter: 10,
  });
  const result = prepare(purchase);

  assert.equal(result.inventoryStateUpdates[0]?.state.stock, 0);
  assert.strictEqual(
    result.inventoryStateUpdates[0]?.state.unitCost,
    previousCost,
  );
});

test('restores negative stock after a Purchase crossed into positive stock', () => {
  const previousCost = Money.fromDecimal('10');
  const unitCost = Money.fromDecimal('12');
  const purchase = purchaseFixture({
    quantity: 10,
    unitCost,
    totalAmount: Money.fromDecimal('120'),
    averageCostBefore: previousCost,
    averageCostAfter: unitCost,
    stockBefore: -5,
    stockAfter: 5,
  });
  const result = prepare(purchase);

  assert.equal(result.reversals[0]?.movement.stockBefore, 5);
  assert.equal(result.reversals[0]?.movement.stockAfter, -5);
  assert.equal(result.inventoryStateUpdates[0]?.state.stock, -5);
  assert.strictEqual(
    result.inventoryStateUpdates[0]?.state.unitCost,
    previousCost,
  );
});

test('restores negative stock when the Purchase had remained negative', () => {
  const unitCost = Money.fromDecimal('12');
  const purchase = purchaseFixture({
    quantity: 3,
    unitCost,
    totalAmount: Money.fromDecimal('36'),
    averageCostBefore: Money.fromDecimal('10'),
    averageCostAfter: unitCost,
    stockBefore: -10,
    stockAfter: -7,
  });
  const result = prepare(purchase);

  assert.equal(result.reversals[0]?.movement.stockBefore, -7);
  assert.equal(result.reversals[0]?.movement.stockAfter, -10);
  assert.equal(result.inventoryStateUpdates[0]?.state.stock, -10);
});

test('restores an unknown previous cost as null', () => {
  const unitCost = Money.fromDecimal('12');
  const purchase = purchaseFixture({
    quantity: 3,
    unitCost,
    totalAmount: Money.fromDecimal('36'),
    averageCostBefore: null,
    averageCostAfter: unitCost,
    stockBefore: -3,
    stockAfter: 0,
  });
  const result = prepare(purchase);

  assert.equal(result.inventoryStateUpdates[0]?.state.unitCost, null);
});

test('restores a known zero previous cost without converting it to null', () => {
  const zero = Money.zero();
  const unitCost = Money.fromDecimal('2');
  const purchase = purchaseFixture({
    quantity: 2,
    unitCost,
    totalAmount: Money.fromDecimal('4'),
    averageCostBefore: zero,
    averageCostAfter: Money.fromDecimal('1'),
    stockBefore: 2,
    stockAfter: 4,
  });
  const result = prepare(purchase);

  assert.strictEqual(result.inventoryStateUpdates[0]?.state.unitCost, zero);
  assert.equal(result.inventoryStateUpdates[0]?.state.unitCost?.scaledUnits, 0);
});

test('rejects current stock that differs from Purchase stockAfter', () => {
  const purchase = purchaseFixture();
  const state = createInventoryState({
    stock: purchase.stockAfter + 1,
    unitCost: purchase.averageCostAfter,
  });

  assert.throws(
    () => prepare(purchase, movementFixture(purchase), state),
    /current inventory state.*purchase.*after/i,
  );
});

test('rejects a different known current cost', () => {
  const purchase = purchaseFixture();
  const state = createInventoryState({
    stock: purchase.stockAfter,
    unitCost: Money.fromDecimal('15.000001'),
  });

  assert.throws(
    () => prepare(purchase, movementFixture(purchase), state),
    /current inventory state.*purchase.*after/i,
  );
});

test('rejects null current cost when averageCostAfter is known', () => {
  const unitCost = Money.fromDecimal('12');
  const purchase = purchaseFixture({
    quantity: 3,
    unitCost,
    totalAmount: Money.fromDecimal('36'),
    averageCostBefore: null,
    averageCostAfter: unitCost,
    stockBefore: -10,
    stockAfter: -7,
  });
  const state = createInventoryState({ stock: -7, unitCost: null });

  assert.throws(
    () => prepare(purchase, movementFixture(purchase), state),
    /current inventory state.*purchase.*after/i,
  );
});

test('rejects null current cost when averageCostAfter is known zero', () => {
  const zero = Money.zero();
  const purchase = purchaseFixture({
    quantity: 3,
    unitCost: zero,
    totalAmount: zero,
    averageCostBefore: null,
    averageCostAfter: zero,
    stockBefore: -3,
    stockAfter: 0,
  });
  const state = createInventoryState({ stock: 0, unitCost: null });

  assert.throws(
    () => prepare(purchase, movementFixture(purchase), state),
    /current inventory state.*purchase.*after/i,
  );
});

test('rejects a movement owned by another Purchase', () => {
  const purchase = purchaseFixture();
  const movement = movementFixture(purchase, { sourceId: 'purchase-2' });

  assert.throws(() => prepare(purchase, movement), /movement.*purchase/i);
});

test('rejects a movement for another Product', () => {
  const purchase = purchaseFixture();
  const movement = movementFixture(purchase, { productId: 'product-2' });

  assert.throws(() => prepare(purchase, movement), /movement.*product/i);
});

test('rejects a movement from another Inventory', () => {
  const purchase = purchaseFixture();
  const movement = movementFixture(purchase, { inventoryId: 'inventory-2' });

  assert.throws(() => prepare(purchase, movement), /movement.*inventory/i);
});

test('rejects an incorrect Purchase movement source type', () => {
  const purchase = purchaseFixture();
  const movement = movementFixture(purchase, { sourceType: 'SALE' });

  assert.throws(() => prepare(purchase, movement), /movement.*purchase/i);
});

for (const type of [
  'INITIAL_STOCK',
  'SALE',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'REVERSAL',
] as const satisfies readonly InventoryMovementType[]) {
  test(`rejects ${type} as the original Purchase movement`, () => {
    const purchase = purchaseFixture();
    const movement = movementFixture(purchase, { type });

    assert.throws(
      () => prepare(purchase, movement),
      /original movement.*PURCHASE/i,
    );
  });
}

test('rejects a non-positive original Purchase movement delta', () => {
  const purchase = purchaseFixture();
  const movement = movementFixture(purchase, {
    quantityDelta: -10,
    stockBefore: 20,
    stockAfter: 10,
  });

  assert.throws(
    () => prepare(purchase, movement),
    /purchase movement.*positive/i,
  );
});

test('rejects a movement delta that differs from Purchase quantity', () => {
  const purchase = purchaseFixture();
  const movement = movementFixture(purchase, {
    quantityDelta: 9,
    stockAfter: 19,
  });

  assert.throws(
    () => prepare(purchase, movement),
    /movement quantity.*purchase quantity/i,
  );
});

test('rejects movement stockBefore that differs from Purchase stockBefore', () => {
  const purchase = purchaseFixture();
  const movement = movementFixture(purchase, {
    stockBefore: 11,
    stockAfter: 21,
  });

  assert.throws(
    () => prepare(purchase, movement),
    /movement stock before.*purchase stock before/i,
  );
});

test('rejects an internally inconsistent movement stockAfter snapshot', () => {
  const purchase = purchaseFixture();
  const movement: InventoryMovement = Object.freeze({
    ...movementFixture(purchase),
    stockAfter: purchase.stockAfter + 1,
  });

  assert.throws(
    () => prepare(purchase, movement),
    /stock after.*stock before.*quantity delta/i,
  );
});

test('rejects a movement unit cost snapshot that differs from Purchase unit cost', () => {
  const purchase = purchaseFixture();
  const movement = movementFixture(purchase, {
    unitCostSnapshot: Money.fromDecimal('20.000001'),
  });

  assert.throws(
    () => prepare(purchase, movement),
    /movement cost snapshot.*purchase unit cost/i,
  );
});

test('prepares the exact REVERSAL convention for the original movement', () => {
  const purchase = purchaseFixture();
  const movement = movementFixture(purchase);
  const result = prepare(purchase, movement);
  const reversal = result.reversals[0];

  assert.equal(result.reversals.length, 1);
  assert.equal(result.inventoryStateUpdates.length, 1);
  assert.equal(reversal?.originalMovementId, movement.id);
  assert.equal(reversal?.productId, purchase.productId);
  assert.equal(reversal?.movement.type, 'REVERSAL');
  assert.equal(reversal?.movement.sourceType, 'INVENTORY_MOVEMENT');
  assert.equal(reversal?.movement.sourceId, movement.id);
  assert.equal(reversal?.movement.quantityDelta, -movement.quantityDelta);
  assert.equal(reversal?.movement.stockBefore, purchase.stockAfter);
  assert.equal(reversal?.movement.stockAfter, purchase.stockBefore);
  assert.strictEqual(
    reversal?.movement.unitCostSnapshot,
    movement.unitCostSnapshot,
  );
  assert.equal(reversal?.movement.metadata, null);
});

test('rejects a void timestamp before the current Purchase updatedAt', () => {
  assert.throws(
    () => prepare(purchaseFixture(), undefined, undefined, CREATED_AT - 1),
    /void timestamp.*purchase updated/i,
  );
});

test('leaves final movement ID and timestamps to Application and contains no Product edits', () => {
  const result = prepare(purchaseFixture());
  const movement = result.reversals[0]?.movement;

  assert.ok(movement);
  assert.equal('id' in movement, false);
  assert.equal('effectiveAt' in movement, false);
  assert.equal('createdAt' in movement, false);
  assert.equal('updatedAt' in movement, false);
  assert.equal('product' in result, false);
  assert.equal('regularSalePrice' in result, false);
});

test('does not mutate Purchase, movement, state, or Money snapshots', () => {
  const purchase = purchaseFixture();
  const movement = movementFixture(purchase);
  const state = currentState(purchase);
  const previousCost = purchase.averageCostBefore;
  const afterCost = purchase.averageCostAfter;
  const result = prepare(purchase, movement, state);

  assert.equal(purchase.status, 'CONFIRMED');
  assert.equal(purchase.updatedAt, CREATED_AT);
  assert.equal(movement.type, 'PURCHASE');
  assert.equal(movement.quantityDelta, 10);
  assert.equal(state.stock, 20);
  assert.strictEqual(purchase.averageCostBefore, previousCost);
  assert.strictEqual(purchase.averageCostAfter, afterCost);
  assert.strictEqual(
    result.inventoryStateUpdates[0]?.state.unitCost,
    previousCost,
  );
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.reversals));
  assert.ok(Object.isFrozen(result.inventoryStateUpdates));
  assert.ok(Object.isFrozen(result.reversals[0]));
  assert.ok(Object.isFrozen(result.inventoryStateUpdates[0]));
});

test('supports the safe-integer boundary when negating a Purchase delta', () => {
  const quantity = Number.MAX_SAFE_INTEGER;
  const zero = Money.zero();
  const purchase = purchaseFixture({
    quantity,
    unitCost: zero,
    totalAmount: zero,
    averageCostBefore: null,
    averageCostAfter: zero,
    stockBefore: -quantity,
    stockAfter: 0,
  });
  const result = prepare(purchase);

  assert.equal(result.reversals[0]?.movement.quantityDelta, -quantity);
  assert.equal(result.reversals[0]?.movement.stockBefore, 0);
  assert.equal(result.reversals[0]?.movement.stockAfter, -quantity);
});
