import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyStockAdjustment,
  createInventoryState,
  createStockAdjustment,
  type AdjustmentCostMode,
  type AdjustmentReason,
  type ApplyStockAdjustmentInput,
  type CreateStockAdjustmentInput,
  Money,
} from '../src/index';

const CREATED_AT = 1_776_444_000_000;

function validPositiveInput(): CreateStockAdjustmentInput {
  return {
    id: 'adjustment-local-1',
    inventoryId: 'inventory-local-1',
    productId: 'product-local-1',
    stockBefore: 10,
    actualStock: 15,
    difference: 5,
    reason: 'COUNT_CORRECTION',
    costMode: 'CUSTOM_COST',
    unitCost: Money.fromDecimal('4'),
    effectiveAt: CREATED_AT - 10_000,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
}

function validNegativeInput(): CreateStockAdjustmentInput {
  return {
    ...validPositiveInput(),
    actualStock: 7,
    difference: -3,
    reason: 'DAMAGED',
    costMode: null,
    unitCost: Money.fromDecimal('2'),
  };
}

function apply(input: Partial<ApplyStockAdjustmentInput> = {}) {
  return applyStockAdjustment({
    inventory: createInventoryState({
      stock: 10,
      unitCost: Money.fromDecimal('2'),
    }),
    actualStock: 15,
    costMode: 'CUSTOM_COST',
    customUnitCost: Money.fromDecimal('4'),
    ...input,
  });
}

test('creates a valid positive StockAdjustment', () => {
  const input = validPositiveInput();
  const adjustment = createStockAdjustment(input);

  assert.equal(adjustment.id, 'adjustment-local-1');
  assert.equal(adjustment.inventoryId, 'inventory-local-1');
  assert.equal(adjustment.productId, 'product-local-1');
  assert.equal(adjustment.stockBefore, 10);
  assert.equal(adjustment.actualStock, 15);
  assert.equal(adjustment.difference, 5);
  assert.equal(adjustment.reason, 'COUNT_CORRECTION');
  assert.equal(adjustment.costMode, 'CUSTOM_COST');
  assert.strictEqual(adjustment.unitCost, input.unitCost);
});

test('creates a valid negative StockAdjustment', () => {
  const input = validNegativeInput();
  const adjustment = createStockAdjustment(input);

  assert.equal(adjustment.stockBefore, 10);
  assert.equal(adjustment.actualStock, 7);
  assert.equal(adjustment.difference, -3);
  assert.equal(adjustment.reason, 'DAMAGED');
  assert.equal(adjustment.costMode, null);
  assert.strictEqual(adjustment.unitCost, input.unitCost);
});

test('accepts actual physical stock zero', () => {
  const result = apply({
    actualStock: 0,
    costMode: null,
    customUnitCost: null,
  });

  assert.equal(result.difference, -10);
  assert.equal(result.inventory.stock, 0);
  assert.ok(result.inventory.unitCost?.equals(Money.fromDecimal('2')));
});

test('rejects negative actual physical stock', () => {
  assert.throws(
    () => apply({ actualStock: -1, costMode: null }),
    /actual stock.*non-negative/i,
  );
  assert.throws(
    () =>
      createStockAdjustment({
        ...validNegativeInput(),
        actualStock: -1,
        difference: -11,
      }),
    /actual stock.*non-negative/i,
  );
});

test('rejects unsafe actual physical stock', () => {
  for (const actualStock of [1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => apply({ actualStock }), /actual stock.*safe integer/i);
  }
});

test('accepts negative stockBefore for a positive adjustment', () => {
  const result = apply({
    inventory: createInventoryState({ stock: -2, unitCost: null }),
    actualStock: 3,
    costMode: 'CUSTOM_COST',
    customUnitCost: Money.fromDecimal('3'),
  });

  assert.equal(result.difference, 5);
  assert.equal(result.inventory.stock, 3);
  assert.ok(result.inventory.unitCost?.equals(Money.fromDecimal('3')));
});

test('rejects unsafe stockBefore', () => {
  assert.throws(
    () =>
      applyStockAdjustment({
        inventory: { stock: Number.MAX_SAFE_INTEGER + 1, unitCost: null },
        actualStock: 0,
        costMode: null,
      }),
    /inventory stock.*safe integer/i,
  );
  assert.throws(
    () =>
      createStockAdjustment({
        ...validPositiveInput(),
        stockBefore: Number.MAX_SAFE_INTEGER + 1,
      }),
    /stock before.*safe integer/i,
  );
});

test('derives difference exactly from physical stock', () => {
  const positive = apply();
  const negative = apply({
    actualStock: 7,
    costMode: null,
    customUnitCost: null,
  });

  assert.equal(positive.difference, 5);
  assert.equal(negative.difference, -3);
});

test('rejects a zero-difference adjustment as a no-op', () => {
  assert.throws(
    () => apply({ actualStock: 10, costMode: null }),
    /adjustment.*difference.*non-zero|no stock adjustment/i,
  );
  assert.throws(
    () =>
      createStockAdjustment({
        ...validPositiveInput(),
        actualStock: 10,
        difference: 0,
      }),
    /adjustment.*difference.*non-zero|no stock adjustment/i,
  );
});

test('rejects a supplied difference inconsistent with stock snapshots', () => {
  assert.throws(
    () => createStockAdjustment({ ...validPositiveInput(), difference: 4 }),
    /difference.*actual stock.*stock before/i,
  );
});

test('requires one of the five canonical reasons', () => {
  const reasons: readonly AdjustmentReason[] = [
    'COUNT_CORRECTION',
    'DAMAGED',
    'LOST',
    'INTERNAL_USE',
    'OTHER',
  ];

  for (const reason of reasons) {
    const input =
      reason === 'COUNT_CORRECTION' || reason === 'OTHER'
        ? { ...validPositiveInput(), reason }
        : { ...validNegativeInput(), reason };
    assert.equal(createStockAdjustment(input).reason, reason);
  }

  assert.throws(
    () =>
      createStockAdjustment({
        ...validPositiveInput(),
        reason: undefined as unknown as AdjustmentReason,
      }),
    /adjustment reason/i,
  );
  assert.throws(
    () =>
      createStockAdjustment({
        ...validPositiveInput(),
        reason: 'CUSTOM' as AdjustmentReason,
      }),
    /adjustment reason/i,
  );
});

test('positive adjustments allow COUNT_CORRECTION and OTHER', () => {
  for (const reason of ['COUNT_CORRECTION', 'OTHER'] as const) {
    assert.equal(
      createStockAdjustment({ ...validPositiveInput(), reason }).reason,
      reason,
    );
  }
});

test('positive adjustments reject damage, loss and internal use reasons', () => {
  for (const reason of ['DAMAGED', 'LOST', 'INTERNAL_USE'] as const) {
    assert.throws(
      () => createStockAdjustment({ ...validPositiveInput(), reason }),
      /positive adjustment.*reason/i,
    );
  }
});

test('negative adjustments accept every canonical reason', () => {
  for (const reason of [
    'COUNT_CORRECTION',
    'DAMAGED',
    'LOST',
    'INTERNAL_USE',
    'OTHER',
  ] as const) {
    assert.equal(
      createStockAdjustment({ ...validNegativeInput(), reason }).reason,
      reason,
    );
  }
});

test('USE_CURRENT_COST resolves the known current cost', () => {
  const currentCost = Money.fromDecimal('2');
  const result = apply({
    inventory: createInventoryState({ stock: 10, unitCost: currentCost }),
    costMode: 'USE_CURRENT_COST',
    customUnitCost: null,
  });

  assert.equal(result.costMode, 'USE_CURRENT_COST');
  assert.strictEqual(result.unitCost, currentCost);
  assert.ok(result.inventory.unitCost?.equals(currentCost));
});

test('USE_CURRENT_COST rejects an unknown current cost', () => {
  assert.throws(
    () =>
      apply({
        inventory: createInventoryState({ stock: 0, unitCost: null }),
        actualStock: 5,
        costMode: 'USE_CURRENT_COST',
        customUnitCost: null,
      }),
    /current cost.*required|unknown current cost/i,
  );
});

test('CUSTOM_COST resolves the explicitly supplied cost', () => {
  const customCost = Money.fromDecimal('4');
  const result = apply({
    costMode: 'CUSTOM_COST',
    customUnitCost: customCost,
  });

  assert.equal(result.costMode, 'CUSTOM_COST');
  assert.strictEqual(result.unitCost, customCost);
});

test('CUSTOM_COST preserves known zero as a valid cost', () => {
  const zero = Money.zero();
  const result = apply({
    inventory: createInventoryState({ stock: 0, unitCost: null }),
    actualStock: 5,
    costMode: 'CUSTOM_COST',
    customUnitCost: zero,
  });

  assert.strictEqual(result.unitCost, zero);
  assert.strictEqual(result.inventory.unitCost, zero);
  assert.equal(result.unitCost.scaledUnits, 0);
});

test('CUSTOM_COST rejects a negative cost', () => {
  assert.throws(
    () => apply({ customUnitCost: Money.fromDecimal('-0.000001') }),
    /custom cost.*negative|adjustment unit cost.*negative/i,
  );
});

test('positive stock uses the existing weighted-average rule', () => {
  const result = apply();

  assert.equal(result.inventory.stock, 15);
  assert.equal(result.inventory.unitCost?.scaledUnits, 2_666_667);
});

test('zero stock ignores a previous historical cost', () => {
  const result = apply({
    inventory: createInventoryState({
      stock: 0,
      unitCost: Money.fromDecimal('1.5'),
    }),
    actualStock: 5,
    customUnitCost: Money.fromDecimal('2'),
  });

  assert.equal(result.inventory.stock, 5);
  assert.equal(result.inventory.unitCost?.scaledUnits, 2_000_000);
});

test('negative stock never participates in positive adjustment costing', () => {
  const result = apply({
    inventory: createInventoryState({ stock: -2, unitCost: null }),
    actualStock: 3,
    customUnitCost: Money.fromDecimal('3'),
  });

  assert.equal(result.inventory.stock, 3);
  assert.equal(result.inventory.unitCost?.scaledUnits, 3_000_000);
});

test('negative adjustment leaves the current unit cost unchanged', () => {
  const currentCost = Money.fromDecimal('2');
  const result = apply({
    inventory: createInventoryState({ stock: 10, unitCost: currentCost }),
    actualStock: 7,
    costMode: null,
    customUnitCost: null,
  });

  assert.equal(result.inventory.stock, 7);
  assert.strictEqual(result.inventory.unitCost, currentCost);
});

test('positive adjustment requires a cost mode and resolved unit cost', () => {
  assert.throws(
    () => apply({ costMode: null, customUnitCost: null }),
    /cost mode.*required/i,
  );
  assert.throws(
    () => apply({ costMode: 'CUSTOM_COST', customUnitCost: null }),
    /custom cost.*required/i,
  );
  assert.throws(
    () =>
      createStockAdjustment({
        ...validPositiveInput(),
        costMode: null,
        unitCost: null,
      }),
    /positive adjustment.*cost mode.*unit cost/i,
  );
});

test('negative adjustment requires null cost mode and current cost snapshot', () => {
  const currentCost = Money.fromDecimal('2');
  const result = apply({
    inventory: createInventoryState({ stock: 10, unitCost: currentCost }),
    actualStock: 7,
    costMode: null,
    customUnitCost: null,
  });

  assert.equal(result.costMode, null);
  assert.strictEqual(result.unitCost, currentCost);

  assert.throws(
    () =>
      createStockAdjustment({
        ...validNegativeInput(),
        costMode: 'CUSTOM_COST',
      }),
    /negative adjustment.*cost mode.*null/i,
  );
  assert.throws(
    () => createStockAdjustment({ ...validNegativeInput(), unitCost: null }),
    /negative adjustment.*unit cost.*required/i,
  );
});

test('negative adjustment rejects any custom cost input', () => {
  assert.throws(
    () =>
      apply({
        actualStock: 7,
        costMode: null,
        customUnitCost: Money.fromDecimal('3'),
      }),
    /negative adjustment.*custom cost/i,
  );
});

test('validates and trims StockAdjustment identifiers', () => {
  const adjustment = createStockAdjustment({
    ...validPositiveInput(),
    id: '  adjustment-local-1  ',
    inventoryId: '  inventory-local-1  ',
    productId: '  product-local-1  ',
  });

  assert.equal(adjustment.id, 'adjustment-local-1');
  assert.equal(adjustment.inventoryId, 'inventory-local-1');
  assert.equal(adjustment.productId, 'product-local-1');

  assert.throws(
    () => createStockAdjustment({ ...validPositiveInput(), id: '   ' }),
    /stock adjustment id.*empty/i,
  );
  assert.throws(
    () => createStockAdjustment({ ...validPositiveInput(), inventoryId: '' }),
    /inventory id.*empty/i,
  );
  assert.throws(
    () => createStockAdjustment({ ...validPositiveInput(), productId: '\t' }),
    /product id.*empty/i,
  );
});

test('validates TimestampMs and updatedAt ordering', () => {
  assert.throws(
    () => createStockAdjustment({ ...validPositiveInput(), effectiveAt: -1 }),
    /effective at.*non-negative/i,
  );
  assert.throws(
    () => createStockAdjustment({ ...validPositiveInput(), createdAt: 1.5 }),
    /created at.*safe integer/i,
  );
  assert.throws(
    () =>
      createStockAdjustment({
        ...validPositiveInput(),
        updatedAt: CREATED_AT - 1,
      }),
    /updated at.*before.*created at/i,
  );
});

test('allows effectiveAt to precede createdAt', () => {
  const adjustment = createStockAdjustment({
    ...validPositiveInput(),
    effectiveAt: CREATED_AT - 50_000,
    updatedAt: CREATED_AT + 1_000,
  });

  assert.equal(adjustment.effectiveAt, CREATED_AT - 50_000);
  assert.equal(adjustment.createdAt, CREATED_AT);
  assert.equal(adjustment.updatedAt, CREATED_AT + 1_000);
});

test('creates immutable results without mutating inputs', () => {
  const entityInput = {
    ...validPositiveInput(),
    id: '  adjustment-local-1  ',
  };
  const originalEntityInput = { ...entityInput };
  const operationInput: ApplyStockAdjustmentInput = {
    inventory: createInventoryState({
      stock: 10,
      unitCost: Money.fromDecimal('2'),
    }),
    actualStock: 15,
    costMode: 'CUSTOM_COST',
    customUnitCost: Money.fromDecimal('4'),
  };
  const originalOperationInput = { ...operationInput };

  const adjustment = createStockAdjustment(entityInput);
  const result = applyStockAdjustment(operationInput);

  assert.ok(Object.isFrozen(adjustment));
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.inventory));
  assert.deepEqual(entityInput, originalEntityInput);
  assert.deepEqual(operationInput, originalOperationInput);
});

test('fails explicitly when the derived difference exceeds safe integer range', () => {
  assert.throws(
    () =>
      apply({
        inventory: createInventoryState({
          stock: Number.MIN_SAFE_INTEGER,
          unitCost: null,
        }),
        actualStock: Number.MAX_SAFE_INTEGER,
      }),
    /difference.*safe integer/i,
  );
});

test('fails explicitly when weighted inventory value overflows Money', () => {
  assert.throws(
    () =>
      apply({
        inventory: createInventoryState({
          stock: Number.MAX_SAFE_INTEGER - 1,
          unitCost: Money.fromScaledUnits(Number.MAX_SAFE_INTEGER),
        }),
        actualStock: Number.MAX_SAFE_INTEGER,
        customUnitCost: Money.zero(),
      }),
    /scaled units.*safe integer/i,
  );
});

test('rejects invalid cost modes and negative entity costs', () => {
  assert.throws(
    () =>
      createStockAdjustment({
        ...validPositiveInput(),
        costMode: 'AVERAGE' as AdjustmentCostMode,
      }),
    /adjustment cost mode/i,
  );
  assert.throws(
    () =>
      createStockAdjustment({
        ...validPositiveInput(),
        unitCost: Money.fromDecimal('-1'),
      }),
    /adjustment unit cost.*negative/i,
  );
});
