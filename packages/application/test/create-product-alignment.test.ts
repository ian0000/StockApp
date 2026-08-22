import assert from 'node:assert/strict';
import test from 'node:test';

import { Money, type InventoryMovement } from '@stock-app/domain';
import {
  CreateProductUseCase,
  type Clock,
  type InventoryMovementIdGenerator,
  type InventoryMovementRepository,
  type ProductIdGenerator,
  type TransactionRepositories,
} from '../src/index';

class SequenceIdGenerator
  implements ProductIdGenerator, InventoryMovementIdGenerator
{
  calls = 0;

  constructor(private readonly ids: readonly string[]) {}

  generate(): string {
    const id = this.ids[this.calls++];
    if (id === undefined) throw new Error('ID sequence exhausted.');
    return id;
  }
}

class FakeClock implements Clock {
  calls = 0;

  constructor(private readonly values: readonly number[]) {}

  now(): number {
    const value = this.values[this.calls++];
    if (value === undefined) throw new Error('Clock sequence exhausted.');
    return value;
  }
}

function createHarness() {
  const productIds = new SequenceIdGenerator(['product-1', 'product-2']);
  const movementIds = new SequenceIdGenerator(['movement-1', 'movement-2']);
  const clock = new FakeClock([1_776_444_000_000, 1_776_444_001_000]);
  const movements: InventoryMovement[] = [];
  const movementRepository: InventoryMovementRepository = {
    async save(movement) {
      movements.push(movement);
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
    inventoryMovementRepository: movementRepository,
    purchaseRepository: { async save() {} },
    saleRepository: { async save() {} },
    saleItemRepository: { async save() {} },
  };
  const useCase = new CreateProductUseCase({
    productIdGenerator: productIds,
    inventoryMovementIdGenerator: movementIds,
    clock,
    transactionManager: {
      runInTransaction: (operation) => operation(repositories),
    },
  });

  return { clock, movementIds, movements, productIds, useCase };
}

function input(initialStock = 0) {
  return {
    inventoryId: 'inventory-1',
    name: 'Coffee',
    regularSalePrice: Money.fromDecimal('2'),
    initialStock,
    initialUnitCost: initialStock === 0 ? null : Money.fromDecimal('1.250001'),
  };
}

test('zero-stock creation uses one timestamp and no movement identity', async () => {
  const { clock, movementIds, useCase } = createHarness();

  const result = await useCase.execute(input());

  assert.equal(clock.calls, 1);
  assert.equal(movementIds.calls, 0);
  assert.equal(result.product.createdAt, 1_776_444_000_000);
  assert.equal(result.product.updatedAt, 1_776_444_000_000);
  assert.equal(result.initialMovement, null);
});

test('positive stock persists a complete movement with one identity', async () => {
  const { clock, movementIds, movements, useCase } = createHarness();

  const result = await useCase.execute(input(20));
  const movement = movements[0];

  assert.equal(clock.calls, 1);
  assert.equal(movementIds.calls, 1);
  assert.strictEqual(result.initialMovement, movement);
  assert.deepEqual(movement, {
    id: 'movement-1',
    inventoryId: 'inventory-1',
    productId: 'product-1',
    type: 'INITIAL_STOCK',
    quantityDelta: 20,
    effectiveAt: 1_776_444_000_000,
    createdAt: 1_776_444_000_000,
    updatedAt: 1_776_444_000_000,
    sourceType: null,
    sourceId: null,
    unitCostSnapshot: Money.fromDecimal('1.250001'),
    stockBefore: 0,
    stockAfter: 20,
    metadata: null,
  });
});

test('repeated executions request independent product and movement IDs', async () => {
  const { movementIds, productIds, useCase } = createHarness();

  const first = await useCase.execute(input(1));
  const second = await useCase.execute(input(1));

  assert.equal(first.product.id, 'product-1');
  assert.equal(second.product.id, 'product-2');
  assert.equal(first.initialMovement?.id, 'movement-1');
  assert.equal(second.initialMovement?.id, 'movement-2');
  assert.equal(productIds.calls, 2);
  assert.equal(movementIds.calls, 2);
});
