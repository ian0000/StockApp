import assert from 'node:assert/strict';
import test from 'node:test';

import type { InventoryStateRecord } from '@stock-app/application';

import {
  mapInventoryStateRowToRecord,
  mapProductRowToDomain,
} from '../src/infrastructure/sqlite/repositories/mappers';
import {
  createSqliteInventoryStateRepository,
  createSqliteProductRepository,
} from '../src/infrastructure/sqlite/repositories/repositories';
import { inventoryStates, products } from '../src/infrastructure/sqlite/schema';

const TIMESTAMP = 1_776_444_000_000;
type ProductRow = typeof products.$inferSelect;
type InventoryStateRow = typeof inventoryStates.$inferSelect;

function productRow(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: 'product-123',
    inventoryId: 'inventory-123',
    name: 'Coca-Cola',
    variant: '500 ml',
    barcode: '0012345',
    regularSalePriceUnits: 1_000_001,
    minimumStock: 2,
    isArchived: false,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP + 1,
    ...overrides,
  };
}

function inventoryStateRow(
  overrides: Partial<InventoryStateRow> = {},
): InventoryStateRow {
  return {
    inventoryId: 'inventory-123',
    productId: 'product-123',
    stock: 10,
    unitCostUnits: 700_001,
    ...overrides,
  };
}

type RepositoryExecutor = Parameters<
  typeof createSqliteInventoryStateRepository
>[0];

class RecordingReadExecutor {
  readonly selectedTables: unknown[] = [];
  readonly whereExpressions: unknown[] = [];
  readonly orderExpressions: unknown[][] = [];

  readonly executor: RepositoryExecutor;

  constructor(
    private readonly productRows: readonly ProductRow[] = [],
    private readonly stateRows: readonly InventoryStateRow[] = [],
  ) {
    this.executor = {
      insert: (() => {
        throw new Error('Read tests must not insert.');
      }) as RepositoryExecutor['insert'],
      select: (() => ({
        from: (table: unknown) => {
          this.selectedTables.push(table);
          const rows = table === products ? this.productRows : this.stateRows;

          return {
            where: (expression: unknown) => {
              this.whereExpressions.push(expression);

              return {
                orderBy: (...expressions: unknown[]) => {
                  this.orderExpressions.push(expressions);
                  return Promise.resolve(rows);
                },
              };
            },
          };
        },
      })) as unknown as RepositoryExecutor['select'],
      update: (() => {
        throw new Error('Read tests must not update.');
      }) as RepositoryExecutor['update'],
    };
  }
}

test('maps every Product row field back to Domain', () => {
  const result = mapProductRowToDomain(productRow());

  assert.equal(result.id, 'product-123');
  assert.equal(result.inventoryId, 'inventory-123');
  assert.equal(result.name, 'Coca-Cola');
  assert.equal(result.variant, '500 ml');
  assert.equal(result.barcode, '0012345');
  assert.equal(result.regularSalePrice.scaledUnits, 1_000_001);
  assert.equal(result.minimumStock, 2);
  assert.equal(result.isArchived, false);
  assert.equal(result.createdAt, TIMESTAMP);
  assert.equal(result.updatedAt, TIMESTAMP + 1);
});

test('Product row mapper preserves nullable fields, leading zeroes, and archived state', () => {
  const result = mapProductRowToDomain(
    productRow({
      variant: null,
      barcode: '000001',
      minimumStock: null,
      isArchived: true,
    }),
  );

  assert.equal(result.variant, null);
  assert.equal(result.barcode, '000001');
  assert.equal(result.minimumStock, null);
  assert.equal(result.isArchived, true);
});

test('maps positive InventoryState and scaled cost back to Domain', () => {
  const result = mapInventoryStateRowToRecord(inventoryStateRow());

  assert.deepEqual(result, {
    inventoryId: 'inventory-123',
    productId: 'product-123',
    state: {
      stock: 10,
      unitCost: result.state.unitCost,
    },
  } satisfies InventoryStateRecord);
  assert.equal(result.state.unitCost?.scaledUnits, 700_001);
});

test('InventoryState row mapper preserves zero stock', () => {
  assert.equal(
    mapInventoryStateRowToRecord(inventoryStateRow({ stock: 0 })).state.stock,
    0,
  );
});

test('InventoryState row mapper preserves negative stock', () => {
  assert.equal(
    mapInventoryStateRowToRecord(inventoryStateRow({ stock: -3 })).state.stock,
    -3,
  );
});

test('InventoryState row mapper preserves unknown cost as null', () => {
  assert.equal(
    mapInventoryStateRowToRecord(
      inventoryStateRow({ stock: 0, unitCostUnits: null }),
    ).state.unitCost,
    null,
  );
});

test('InventoryState row mapper preserves known zero cost', () => {
  assert.equal(
    mapInventoryStateRowToRecord(
      inventoryStateRow({ stock: 1, unitCostUnits: 0 }),
    ).state.unitCost?.scaledUnits,
    0,
  );
});

test('ProductRepository reads products for one inventory with deterministic ordering', async () => {
  const recording = new RecordingReadExecutor([
    productRow({ id: 'product-2' }),
    productRow({ id: 'product-1' }),
  ]);
  const repository = createSqliteProductRepository(recording.executor);

  const result = await repository.listByInventory('inventory-123');

  assert.deepEqual(recording.selectedTables, [products]);
  assert.equal(recording.whereExpressions.length, 1);
  assert.equal(recording.orderExpressions[0]?.length, 2);
  assert.deepEqual(
    result.map(({ id }) => id),
    ['product-2', 'product-1'],
  );
});

test('ProductRepository returns an empty list', async () => {
  const recording = new RecordingReadExecutor([]);
  const repository = createSqliteProductRepository(recording.executor);

  assert.deepEqual(await repository.listByInventory('inventory-123'), []);
});

test('InventoryStateRepository reads state rows for one inventory', async () => {
  const recording = new RecordingReadExecutor([], [inventoryStateRow()]);
  const repository = createSqliteInventoryStateRepository(recording.executor);

  const result = await repository.listByInventory('inventory-123');

  assert.deepEqual(recording.selectedTables, [inventoryStates]);
  assert.equal(recording.whereExpressions.length, 1);
  assert.equal(recording.orderExpressions[0]?.length, 1);
  assert.equal(result[0]?.productId, 'product-123');
  assert.equal(result[0]?.state.stock, 10);
});
