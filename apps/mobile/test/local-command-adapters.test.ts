import assert from 'node:assert/strict';
import test from 'node:test';
import { Money, type InventoryMovement, type Product } from '@stock-app/domain';
import type {
  InventoryStateRecord,
  TransactionManager,
  TransactionRepositories,
} from '@stock-app/application';
import { assembleLocalCommands } from '../src/composition/local-commands';
import { generateUuidV7 } from '../src/infrastructure/identity/uuid-v7';

test('local callers generate UUIDv7 before Application and preserve an offline multiline sale', async () => {
  const clock = { now: () => 1000 };
  const generated: string[] = [];
  const products: Product[] = [];
  const states: InventoryStateRecord[] = [];
  const movements: InventoryMovement[] = [];
  const unused = async () => {
    throw new Error('Unexpected repository use.');
  };
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
      async save(state) {
        states.push(state);
      },
      async update(state) {
        const index = states.findIndex(
          (entry) => entry.productId === state.productId,
        );
        states[index] = state;
      },
    },
    inventoryMovementRepository: {
      async save(movement) {
        movements.push(movement);
      },
    },
    purchaseRepository: { save: unused },
    stockAdjustmentRepository: { save: unused },
    saleRepository: { async save() {} },
    saleItemRepository: { async save() {} },
    saleVoidRepository: {
      findSale: unused,
      listSaleItems: unused,
      listOriginalSaleMovements: unused,
      listReversals: unused,
      listProductMovementsAtOrAfter: unused,
      listInventoryStates: unused,
      saveReversal: unused,
      updateInventoryState: unused,
      updateSale: unused,
    },
    purchaseVoidRepository: {
      findPurchase: unused,
      listOriginalPurchaseMovements: unused,
      listReversals: unused,
      listProductMovementsAtOrAfter: unused,
      listInventoryStates: unused,
      saveReversal: unused,
      updateInventoryState: unused,
      updatePurchase: unused,
    },
  };
  const transactionManager: TransactionManager = {
    async runInTransaction(operation) {
      assert.ok(
        generated.length > 0,
        'caller preparation must precede Application persistence',
      );
      return operation(repositories);
    },
  };
  const local = assembleLocalCommands({
    clock,
    transactionManager,
    saleDetailsReader: { findById: unused },
    idGenerator: {
      generate() {
        const random = new Uint8Array(16);
        random[15] = generated.length + 1;
        const id = generateUuidV7(clock, random);
        generated.push(id);
        return id;
      },
    },
  });
  const input = {
    inventoryId: 'inventory-local',
    name: 'Producto',
    initialStock: 0,
    initialUnitCost: null,
    regularSalePrice: Money.fromDecimal('2'),
  };
  const first = await local.createProduct.execute(input);
  const second = await local.createProduct.execute(input);
  const result = await local.registerSale.execute({
    inventoryId: 'inventory-local',
    items: [first, second].map(({ product }) => ({
      productId: product.id,
      quantity: 1,
      unitSalePrice: Money.fromDecimal('2'),
    })),
  });
  assert.equal(result.sale.id, generated[2]);
  assert.deepEqual(
    result.items.map((item) => item.id),
    [generated[3], generated[5]],
  );
  assert.deepEqual(
    movements.map((movement) => movement.id),
    [generated[4], generated[6]],
  );
  assert.equal(result.sale.effectiveAt, 1000);
  assert.equal(result.sale.createdAt, 1000);
  assert.equal(result.sale.estimatedProfit, null);
  assert.deepEqual(
    states.map((state) => state.state.stock),
    [-1, -1],
  );
  assert.equal(new Set(generated).size, generated.length);
  for (const id of generated)
    assert.match(
      id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
});
