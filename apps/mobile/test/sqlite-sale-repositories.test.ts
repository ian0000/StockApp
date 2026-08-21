import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSale,
  createSaleItem,
  Money,
  type InventoryState,
} from '@stock-app/domain';

import {
  createSqliteInventoryStateRepository,
  createSqliteSaleItemRepository,
  createSqliteSaleRepository,
} from '../src/infrastructure/sqlite/repositories/repositories';
import {
  inventoryStates,
  saleItems,
  sales,
} from '../src/infrastructure/sqlite/schema';

const TIMESTAMP = 1_776_444_000_000;
type RepositoryExecutor = Parameters<
  typeof createSqliteInventoryStateRepository
>[0];

class RecordingExecutor {
  readonly insertedTables: unknown[] = [];
  readonly insertedRows: unknown[] = [];
  readonly updatedTables: unknown[] = [];
  readonly updatedValues: unknown[] = [];
  readonly whereExpressions: unknown[] = [];
  readonly executor: RepositoryExecutor;

  constructor(
    private readonly updateChanges = 1,
    private readonly writeError: Error | null = null,
  ) {
    this.executor = {
      insert: ((table: unknown) => {
        this.insertedTables.push(table);
        return {
          values: (row: unknown) => {
            this.insertedRows.push(row);
            return {
              run: () => {
                if (this.writeError !== null) throw this.writeError;
              },
            };
          },
        };
      }) as RepositoryExecutor['insert'],
      select: (() => {
        throw new Error('Write tests must not select.');
      }) as RepositoryExecutor['select'],
      update: ((table: unknown) => {
        this.updatedTables.push(table);
        return {
          set: (values: unknown) => {
            this.updatedValues.push(values);
            return {
              where: (expression: unknown) => {
                this.whereExpressions.push(expression);
                return {
                  run: () => {
                    if (this.writeError !== null) throw this.writeError;
                    return { changes: this.updateChanges };
                  },
                };
              },
            };
          },
        };
      }) as RepositoryExecutor['update'],
    };
  }
}

function createKnownSale() {
  return createSale({
    id: 'sale-123',
    inventoryId: 'inventory-123',
    effectiveAt: TIMESTAMP,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    status: 'CONFIRMED',
    totalAmount: Money.fromDecimal('2.5'),
    estimatedCost: Money.fromDecimal('1'),
    estimatedProfit: Money.fromDecimal('1.5'),
    notes: null,
  });
}

function createKnownItem() {
  return createSaleItem({
    id: 'item-123',
    saleId: 'sale-123',
    productId: 'product-123',
    quantity: 2,
    unitSalePrice: Money.fromDecimal('1.25'),
    subtotal: Money.fromDecimal('2.5'),
    unitCostSnapshot: Money.fromDecimal('0.5'),
    estimatedCost: Money.fromDecimal('1'),
    estimatedProfit: Money.fromDecimal('1.5'),
    costStatus: 'KNOWN',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  });
}

test('SaleRepository performs one strict insert into sales', async () => {
  const recording = new RecordingExecutor();
  const repository = createSqliteSaleRepository(recording.executor);

  await repository.save(createKnownSale());

  assert.deepEqual(recording.insertedTables, [sales]);
  assert.equal(recording.insertedRows.length, 1);
});

test('SaleItemRepository performs one strict insert into sale_items', async () => {
  const recording = new RecordingExecutor();
  const repository = createSqliteSaleItemRepository(recording.executor);

  await repository.save(createKnownItem());

  assert.deepEqual(recording.insertedTables, [saleItems]);
  assert.equal(recording.insertedRows.length, 1);
});

test('sale repositories propagate SQLite insert failures unchanged', async () => {
  const error = new Error('SQLITE_CONSTRAINT');
  const recording = new RecordingExecutor(1, error);

  await assert.rejects(
    () =>
      createSqliteSaleRepository(recording.executor).save(createKnownSale()),
    error,
  );
});

for (const [label, state, expected] of [
  [
    'positive stock and known cost',
    { stock: 8, unitCost: Money.fromDecimal('0.7') },
    { stock: 8, unitCostUnits: 700_000 },
  ],
  [
    'negative stock and unknown cost',
    { stock: -2, unitCost: null },
    { stock: -2, unitCostUnits: null },
  ],
  [
    'zero stock and known zero cost',
    { stock: 0, unitCost: Money.zero() },
    { stock: 0, unitCostUnits: 0 },
  ],
] as const satisfies readonly (readonly [string, InventoryState, object])[]) {
  test(`InventoryStateRepository updates ${label}`, async () => {
    const recording = new RecordingExecutor();
    const repository = createSqliteInventoryStateRepository(recording.executor);

    await repository.update({
      inventoryId: 'inventory-123',
      productId: 'product-123',
      state,
    });

    assert.deepEqual(recording.updatedTables, [inventoryStates]);
    assert.deepEqual(recording.updatedValues, [expected]);
    assert.equal(recording.whereExpressions.length, 1);
  });
}

test('InventoryStateRepository fails when the target row does not exist', async () => {
  const recording = new RecordingExecutor(0);
  const repository = createSqliteInventoryStateRepository(recording.executor);

  await assert.rejects(
    () =>
      repository.update({
        inventoryId: 'inventory-123',
        productId: 'missing-product',
        state: { stock: -1, unitCost: null },
      }),
    /Expected to update one InventoryState, updated 0/,
  );
});

test('InventoryStateRepository propagates SQLite update failures unchanged', async () => {
  const error = new Error('SQLITE_BUSY');
  const recording = new RecordingExecutor(1, error);
  const repository = createSqliteInventoryStateRepository(recording.executor);

  await assert.rejects(
    () =>
      repository.update({
        inventoryId: 'inventory-123',
        productId: 'product-123',
        state: { stock: 4, unitCost: Money.fromDecimal('0.7') },
      }),
    error,
  );
});
