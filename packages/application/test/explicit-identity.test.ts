import assert from 'node:assert/strict';
import test from 'node:test';
import { Money, type InventoryMovement } from '@stock-app/domain';
import {
  CreateProductUseCase,
  RegisterSaleUseCase,
  RegisterPurchaseUseCase,
  AdjustStockUseCase,
  type InventoryStateRecord,
  type TransactionRepositories,
  type TransactionManager,
} from '../src/index';
import {
  unusedPurchaseVoidRepository,
  unusedSaleVoidRepository,
} from './support/unused-sale-void-repository';

function fixture() {
  const products: Awaited<
    ReturnType<TransactionRepositories['productRepository']['listByInventory']>
  >[number][] = [];
  const states: InventoryStateRecord[] = [];
  const movements: InventoryMovement[] = [];
  let calls = 0;
  const repositories: TransactionRepositories = {
    productRepository: {
      async listByInventory() {
        return products;
      },
      async save(product) {
        products.push(product);
      },
    },
    inventoryStateRepository: {
      async listByInventory() {
        return states;
      },
      async save(record) {
        states.push(record);
      },
      async update(record) {
        const index = states.findIndex(
          (state) => state.productId === record.productId,
        );
        states[index] = record;
      },
    },
    inventoryMovementRepository: {
      async save(movement) {
        movements.push(movement);
      },
    },
    saleRepository: { async save() {} },
    saleItemRepository: { async save() {} },
    purchaseRepository: { async save() {} },
    stockAdjustmentRepository: { async save() {} },
    saleVoidRepository: unusedSaleVoidRepository,
    purchaseVoidRepository: unusedPurchaseVoidRepository,
  };
  const transactionManager: TransactionManager = {
    async runInTransaction(operation) {
      calls++;
      return operation(repositories);
    },
  };
  return {
    transactionManager,
    products,
    states,
    movements,
    calls: () => calls,
  };
}
const creation = {
  productId: 'caller-product-a',
  initialMovementId: 'caller-initial-a',
  inventoryId: 'inventory',
  name: 'Producto',
  regularSalePrice: Money.fromDecimal('2'),
  initialStock: 3,
  initialUnitCost: Money.fromDecimal('1'),
  occurredAt: 100,
  createdAt: 150,
};

test('CreateProduct preserves caller IDs and separates effectiveAt from original creation time', async () => {
  const f = fixture();
  const result = await new CreateProductUseCase({
    transactionManager: f.transactionManager,
  }).execute(creation);
  assert.equal(result.product.id, 'caller-product-a');
  assert.equal(result.product.createdAt, 150);
  assert.equal(result.initialMovement?.id, 'caller-initial-a');
  assert.equal(result.initialMovement?.effectiveAt, 100);
  assert.equal(result.initialMovement?.createdAt, 150);
});

test('sale preserves each explicit line identity and time while deriving existing snapshots and negative stock', async () => {
  const f = fixture();
  const create = new CreateProductUseCase({
    transactionManager: f.transactionManager,
  });
  await create.execute(creation);
  await create.execute({
    ...creation,
    productId: 'caller-product-b',
    initialMovementId: null,
    initialStock: 0,
    initialUnitCost: null,
  });
  const result = await new RegisterSaleUseCase({
    transactionManager: f.transactionManager,
  }).execute({
    inventoryId: 'inventory',
    saleId: 'caller-sale',
    occurredAt: 200,
    createdAt: 250,
    items: [
      {
        productId: 'caller-product-b',
        saleItemId: 'caller-item-b',
        movementId: 'caller-movement-b',
        quantity: 1,
        unitSalePrice: Money.fromDecimal('2'),
      },
      {
        productId: 'caller-product-a',
        saleItemId: 'caller-item-a',
        movementId: 'caller-movement-a',
        quantity: 4,
        unitSalePrice: Money.fromDecimal('2'),
      },
    ],
  });
  assert.equal(result.sale.id, 'caller-sale');
  assert.equal(result.sale.effectiveAt, 200);
  assert.equal(result.sale.createdAt, 250);
  assert.deepEqual(
    result.items.map((item) => [item.productId, item.id]),
    [
      ['caller-product-b', 'caller-item-b'],
      ['caller-product-a', 'caller-item-a'],
    ],
  );
  assert.deepEqual(
    f.movements
      .slice(1)
      .map((movement) => [
        movement.id,
        movement.effectiveAt,
        movement.createdAt,
      ]),
    [
      ['caller-movement-b', 200, 250],
      ['caller-movement-a', 200, 250],
    ],
  );
  assert.equal(
    f.states.find((state) => state.productId === 'caller-product-a')?.state
      .stock,
    -1,
  );
  assert.equal(result.items[0]?.estimatedProfit, null);
  assert.equal(
    result.items[1]?.estimatedProfit?.scaledUnits,
    Money.fromDecimal('4').scaledUnits,
  );
});

test('purchase and adjustment preserve explicit entity/movement IDs and commercial time', async () => {
  const f = fixture();
  await new CreateProductUseCase({
    transactionManager: f.transactionManager,
  }).execute(creation);
  const purchase = await new RegisterPurchaseUseCase({
    transactionManager: f.transactionManager,
  }).execute({
    inventoryId: 'inventory',
    productId: creation.productId,
    purchaseId: 'caller-purchase',
    movementId: 'caller-purchase-movement',
    quantity: 2,
    unitCost: Money.fromDecimal('1'),
    occurredAt: 200,
    createdAt: 300,
  });
  assert.equal(purchase.purchase.id, 'caller-purchase');
  assert.equal(purchase.purchase.effectiveAt, 200);
  assert.equal(purchase.purchase.createdAt, 300);
  const adjustment = await new AdjustStockUseCase({
    transactionManager: f.transactionManager,
  }).execute({
    inventoryId: 'inventory',
    productId: creation.productId,
    stockAdjustmentId: 'caller-adjustment',
    movementId: 'caller-adjustment-movement',
    actualStock: 3,
    reason: 'DAMAGED',
    occurredAt: 400,
    createdAt: 500,
  });
  assert.equal(adjustment.adjustment.id, 'caller-adjustment');
  assert.equal(adjustment.adjustment.effectiveAt, 400);
  assert.equal(adjustment.adjustment.createdAt, 500);
  assert.deepEqual(
    f.movements.slice(1).map((movement) => movement.id),
    ['caller-purchase-movement', 'caller-adjustment-movement'],
  );
});

test('duplicate supplied new IDs fail before any persistence transaction', async () => {
  const f = fixture();
  await assert.rejects(
    new CreateProductUseCase({
      transactionManager: f.transactionManager,
    }).execute({ ...creation, initialMovementId: creation.productId }),
    /identit|duplicate/i,
  );
  assert.equal(f.calls(), 0);
  await assert.rejects(
    new RegisterSaleUseCase({
      transactionManager: f.transactionManager,
    }).execute({
      inventoryId: 'inventory',
      saleId: 'sale',
      occurredAt: 200,
      createdAt: 200,
      items: [
        {
          productId: 'a',
          saleItemId: 'item',
          movementId: 'item',
          quantity: 1,
          unitSalePrice: Money.fromDecimal('1'),
        },
      ],
    }),
    /identit|duplicate/i,
  );
  assert.equal(f.calls(), 0);
});
