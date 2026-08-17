import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInventoryMovementDraft,
  createPurchaseMovement,
  Money,
  type CreateInventoryMovementDraftInput,
  type InventoryMovementType,
} from '../src/index';

function purchaseDraft(
  overrides: Partial<Parameters<typeof createPurchaseMovement>[0]> = {},
) {
  return createPurchaseMovement({
    quantity: 5,
    unitCost: Money.fromDecimal('8'),
    stockBefore: 0,
    ...overrides,
  });
}

function genericDraft(
  overrides: Partial<CreateInventoryMovementDraftInput> = {},
) {
  return createInventoryMovementDraft({
    type: 'SALE',
    quantityDelta: -2,
    unitCostSnapshot: null,
    stockBefore: 3,
    stockAfter: 1,
    sourceType: null,
    sourceId: null,
    metadata: null,
    ...overrides,
  });
}

test('creates a purchase movement draft', () => {
  assert.equal(purchaseDraft().type, 'PURCHASE');
});

test('uses purchased quantity as a positive delta', () => {
  assert.equal(purchaseDraft().quantityDelta, 5);
});

test('captures the exact purchase unit cost snapshot', () => {
  const unitCost = Money.fromDecimal('10.666667');
  const movement = purchaseDraft({ quantity: 3, unitCost });

  assert.strictEqual(movement.unitCostSnapshot, unitCost);
  assert.equal(movement.unitCostSnapshot?.scaledUnits, 10_666_667);
});

test('supports a real zero purchase unit cost', () => {
  const movement = purchaseDraft({ quantity: 1, unitCost: Money.zero() });

  assert.ok(movement.unitCostSnapshot?.equals(Money.zero()));
});

test('rejects invalid purchase quantities', () => {
  assert.throws(
    () => purchaseDraft({ quantity: 0 }),
    /purchase quantity.*greater than zero/i,
  );
  assert.throws(
    () => purchaseDraft({ quantity: -1 }),
    /purchase quantity.*greater than zero/i,
  );
  assert.throws(
    () => purchaseDraft({ quantity: 1.5 }),
    /purchase quantity.*safe integer/i,
  );
  assert.throws(
    () => purchaseDraft({ quantity: Number.MAX_SAFE_INTEGER + 1 }),
    /purchase quantity.*safe integer/i,
  );
});

test('rejects a negative purchase unit cost', () => {
  assert.throws(
    () => purchaseDraft({ unitCost: Money.fromDecimal('-0.000001') }),
    /movement cost snapshot.*negative/i,
  );
});

test('creates an immutable draft without mutating Money', () => {
  const unitCost = Money.fromDecimal('3.125');
  const movement = purchaseDraft({ quantity: 2, unitCost });

  assert.ok(Object.isFrozen(movement));
  assert.throws(() => Object.assign(movement, { quantityDelta: 9 }), TypeError);
  assert.equal(unitCost.scaledUnits, 3_125_000);
});

test('supports an unknown cost on a generic draft', () => {
  assert.equal(genericDraft().unitCostSnapshot, null);
});

test('rejects a zero quantity delta', () => {
  assert.throws(
    () =>
      genericDraft({
        type: 'ADJUSTMENT_IN',
        quantityDelta: 0,
        stockBefore: 1,
        stockAfter: 1,
      }),
    /quantity delta.*non-zero/i,
  );
});

test('supports a negative quantity delta', () => {
  const movement = genericDraft({
    type: 'ADJUSTMENT_OUT',
    quantityDelta: -3,
    unitCostSnapshot: Money.fromDecimal('2'),
    stockBefore: 5,
    stockAfter: 2,
  });

  assert.equal(movement.quantityDelta, -3);
});

test('accepts safe integer quantity boundaries when stock remains safe', () => {
  const purchase = purchaseDraft({
    quantity: Number.MAX_SAFE_INTEGER,
    unitCost: Money.zero(),
    stockBefore: 0,
  });
  const outbound = genericDraft({
    quantityDelta: Number.MIN_SAFE_INTEGER,
    stockBefore: 0,
    stockAfter: Number.MIN_SAFE_INTEGER,
  });

  assert.equal(purchase.quantityDelta, Number.MAX_SAFE_INTEGER);
  assert.equal(outbound.quantityDelta, Number.MIN_SAFE_INTEGER);
});

test('rejects an unsafe negative quantity delta', () => {
  assert.throws(
    () => genericDraft({ quantityDelta: Number.MIN_SAFE_INTEGER - 1 }),
    /quantity delta.*safe integer/i,
  );
});

test('represents exactly the initial Baseline movement types', () => {
  const movementTypes = [
    'INITIAL_STOCK',
    'PURCHASE',
    'SALE',
    'ADJUSTMENT_IN',
    'ADJUSTMENT_OUT',
    'REVERSAL',
  ] as const satisfies readonly InventoryMovementType[];

  const movements = movementTypes.map((type) =>
    genericDraft({
      type,
      quantityDelta: 1,
      stockBefore: 0,
      stockAfter: 1,
    }),
  );

  assert.deepEqual(
    movements.map(({ type }) => type),
    movementTypes,
  );
});
