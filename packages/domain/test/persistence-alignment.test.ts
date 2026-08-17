import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInitialStockMovement,
  createInventoryMovement,
  createProduct,
  createPurchaseMovement,
  Money,
} from '../src/index';

const CREATED_AT = 1_776_444_000_000;

function validProductInput() {
  return {
    id: 'product-1',
    inventoryId: 'inventory-1',
    name: 'Coffee',
    regularSalePrice: Money.fromDecimal('2.5'),
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
}

function validMovementInput() {
  return {
    id: 'movement-1',
    inventoryId: 'inventory-1',
    productId: 'product-1',
    type: 'INITIAL_STOCK' as const,
    quantityDelta: 5,
    effectiveAt: CREATED_AT,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    sourceType: null,
    sourceId: null,
    unitCostSnapshot: Money.fromDecimal('1.25'),
    stockBefore: 0,
    stockAfter: 5,
    metadata: null,
  };
}

test('Product preserves required creation and update timestamps', () => {
  const product = createProduct(validProductInput());

  assert.equal(product.createdAt, CREATED_AT);
  assert.equal(product.updatedAt, CREATED_AT);
});

test('Product rejects invalid timestamps and reversed update time', () => {
  assert.throws(
    () => createProduct({ ...validProductInput(), createdAt: -1 }),
    /created at.*non-negative/i,
  );
  assert.throws(
    () =>
      createProduct({
        ...validProductInput(),
        updatedAt: Number.MAX_SAFE_INTEGER + 1,
      }),
    /updated at.*safe integer/i,
  );
  assert.throws(
    () => createProduct({ ...validProductInput(), updatedAt: CREATED_AT - 1 }),
    /updated at.*before.*created at/i,
  );
});

test('creates a complete immutable InventoryMovement', () => {
  const movement = createInventoryMovement(validMovementInput());

  assert.deepEqual(movement, validMovementInput());
  assert.ok(Object.isFrozen(movement));
});

test('InventoryMovement trims opaque identifiers and rejects empty ones', () => {
  const movement = createInventoryMovement({
    ...validMovementInput(),
    id: '  movement-1  ',
    inventoryId: '  inventory-1  ',
    productId: '  product-1  ',
  });

  assert.equal(movement.id, 'movement-1');
  assert.equal(movement.inventoryId, 'inventory-1');
  assert.equal(movement.productId, 'product-1');
  assert.throws(
    () => createInventoryMovement({ ...validMovementInput(), id: '  ' }),
    /movement id.*empty/i,
  );
  assert.throws(
    () => createInventoryMovement({ ...validMovementInput(), inventoryId: '' }),
    /inventory id.*empty/i,
  );
  assert.throws(
    () => createInventoryMovement({ ...validMovementInput(), productId: '' }),
    /product id.*empty/i,
  );
});

test('InventoryMovement validates timestamps without forbidding backdating', () => {
  const backdated = createInventoryMovement({
    ...validMovementInput(),
    effectiveAt: CREATED_AT - 86_400_000,
  });

  assert.equal(backdated.effectiveAt, CREATED_AT - 86_400_000);
  assert.throws(
    () =>
      createInventoryMovement({ ...validMovementInput(), effectiveAt: 1.5 }),
    /effective at.*safe integer/i,
  );
  assert.throws(
    () => createInventoryMovement({ ...validMovementInput(), createdAt: -1 }),
    /created at.*non-negative/i,
  );
  assert.throws(
    () =>
      createInventoryMovement({
        ...validMovementInput(),
        updatedAt: CREATED_AT - 1,
      }),
    /updated at.*before.*created at/i,
  );
});

test('InventoryMovement enforces stock snapshots and supports negative stock', () => {
  const movement = createInventoryMovement({
    ...validMovementInput(),
    type: 'SALE',
    quantityDelta: -2,
    stockBefore: -1,
    stockAfter: -3,
  });

  assert.equal(movement.stockBefore, -1);
  assert.equal(movement.stockAfter, -3);
  assert.throws(
    () => createInventoryMovement({ ...validMovementInput(), stockAfter: 6 }),
    /stock after.*stock before.*quantity delta/i,
  );
  assert.throws(
    () =>
      createInventoryMovement({
        ...validMovementInput(),
        quantityDelta: 1,
        stockBefore: Number.MAX_SAFE_INTEGER,
        stockAfter: Number.MAX_SAFE_INTEGER,
      }),
    /stock calculation.*safe integer/i,
  );
});

test('InventoryMovement preserves null, zero, and known cost snapshots', () => {
  const unknown = createInventoryMovement({
    ...validMovementInput(),
    unitCostSnapshot: null,
  });
  const zero = createInventoryMovement({
    ...validMovementInput(),
    unitCostSnapshot: Money.zero(),
  });

  assert.equal(unknown.unitCostSnapshot, null);
  assert.ok(zero.unitCostSnapshot?.equals(Money.zero()));
  assert.throws(
    () =>
      createInventoryMovement({
        ...validMovementInput(),
        unitCostSnapshot: Money.fromDecimal('-0.000001'),
      }),
    /cost snapshot.*negative/i,
  );
});

test('sourceType and sourceId must both be null or both be present', () => {
  assert.equal(createInventoryMovement(validMovementInput()).sourceType, null);
  const linked = createInventoryMovement({
    ...validMovementInput(),
    sourceType: '  PURCHASE  ',
    sourceId: '  purchase-1  ',
  });

  assert.equal(linked.sourceType, 'PURCHASE');
  assert.equal(linked.sourceId, 'purchase-1');
  assert.throws(
    () =>
      createInventoryMovement({
        ...validMovementInput(),
        sourceType: 'PURCHASE',
      }),
    /source type.*source id.*together/i,
  );
  assert.throws(
    () =>
      createInventoryMovement({
        ...validMovementInput(),
        sourceId: 'purchase-1',
      }),
    /source type.*source id.*together/i,
  );
});

test('INITIAL_STOCK draft carries exact historical semantics', () => {
  const unitCost = Money.fromDecimal('10');
  const draft = createInitialStockMovement({ quantity: 20, unitCost });

  assert.deepEqual(draft, {
    type: 'INITIAL_STOCK',
    quantityDelta: 20,
    unitCostSnapshot: unitCost,
    stockBefore: 0,
    stockAfter: 20,
    sourceType: null,
    sourceId: null,
    metadata: null,
  });
});

test('movement metadata defaults to null', () => {
  const { metadata: _metadata, ...withoutMetadata } = validMovementInput();
  const movement = createInventoryMovement(withoutMetadata);

  assert.equal(movement.metadata, null);
});

test('purchase movement remains a draft with explicit stock snapshots', () => {
  const draft = createPurchaseMovement({
    quantity: 3,
    unitCost: Money.fromDecimal('4'),
    stockBefore: -1,
  });

  assert.equal(draft.stockBefore, -1);
  assert.equal(draft.stockAfter, 2);
  assert.equal(draft.unitCostSnapshot?.scaledUnits, 4_000_000);
});
