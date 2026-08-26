import assert from 'node:assert/strict';
import test from 'node:test';

import { createStockAdjustment, Money } from '@stock-app/domain';

import {
  createSqliteStockAdjustmentRepository,
  createSqliteTransactionRepositories,
} from '../src/infrastructure/sqlite/repositories/repositories';
import { stockAdjustments } from '../src/infrastructure/sqlite/schema';

const TIMESTAMP = 1_776_444_000_000;
type RepositoryExecutor = Parameters<
  typeof createSqliteStockAdjustmentRepository
>[0];
type TransactionExecutor = Parameters<
  typeof createSqliteTransactionRepositories
>[0];

class RecordingExecutor {
  readonly insertedTables: unknown[] = [];
  readonly insertedRows: unknown[] = [];
  readonly executor: RepositoryExecutor & TransactionExecutor;

  constructor(private readonly writeError: Error | null = null) {
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
      }) as TransactionExecutor['insert'],
      select: (() => {
        throw new Error('StockAdjustment write must not select.');
      }) as TransactionExecutor['select'],
      update: (() => {
        throw new Error('StockAdjustment write must not update.');
      }) as TransactionExecutor['update'],
    };
  }
}

function adjustment() {
  return createStockAdjustment({
    id: 'adjustment-1',
    inventoryId: 'inventory-1',
    productId: 'product-1',
    stockBefore: 10,
    actualStock: 15,
    difference: 5,
    reason: 'COUNT_CORRECTION',
    costMode: 'CUSTOM_COST',
    unitCost: Money.fromDecimal('4'),
    effectiveAt: TIMESTAMP,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  });
}

test('StockAdjustmentRepository performs one strict insert', async () => {
  const recording = new RecordingExecutor();
  await createSqliteStockAdjustmentRepository(recording.executor).save(
    adjustment(),
  );

  assert.deepEqual(recording.insertedTables, [stockAdjustments]);
  assert.equal(recording.insertedRows.length, 1);
});

test('StockAdjustmentRepository propagates duplicate identity failure', async () => {
  const error = new Error('SQLITE_CONSTRAINT_PRIMARYKEY');
  const recording = new RecordingExecutor(error);

  await assert.rejects(
    () =>
      createSqliteStockAdjustmentRepository(recording.executor).save(
        adjustment(),
      ),
    error,
  );
});

test('transaction repositories construct StockAdjustmentRepository on scoped executor', async () => {
  const recording = new RecordingExecutor();
  const repositories = createSqliteTransactionRepositories(recording.executor);

  await repositories.stockAdjustmentRepository.save(adjustment());

  assert.deepEqual(recording.insertedTables, [stockAdjustments]);
});
