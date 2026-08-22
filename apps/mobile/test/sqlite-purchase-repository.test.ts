import assert from 'node:assert/strict';
import test from 'node:test';

import { createPurchase, Money } from '@stock-app/domain';

import {
  createSqlitePurchaseRepository,
  createSqliteTransactionRepositories,
} from '../src/infrastructure/sqlite/repositories/repositories';
import { purchases } from '../src/infrastructure/sqlite/schema';

const TIMESTAMP = 1_776_444_000_000;
type RepositoryExecutor = Parameters<typeof createSqlitePurchaseRepository>[0];
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
        throw new Error('Purchase write must not select.');
      }) as TransactionExecutor['select'],
      update: (() => {
        throw new Error('Purchase write must not update.');
      }) as TransactionExecutor['update'],
    };
  }
}

function purchase() {
  return createPurchase({
    id: 'purchase-1',
    inventoryId: 'inventory-1',
    productId: 'product-1',
    quantity: 4,
    unitCost: Money.fromDecimal('2'),
    totalAmount: Money.fromDecimal('8'),
    effectiveAt: TIMESTAMP,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    status: 'CONFIRMED',
    notes: null,
    averageCostBefore: null,
    averageCostAfter: Money.fromDecimal('2'),
    stockBefore: -10,
    stockAfter: -6,
  });
}

test('PurchaseRepository performs one strict insert into purchases', async () => {
  const recording = new RecordingExecutor();
  await createSqlitePurchaseRepository(recording.executor).save(purchase());

  assert.deepEqual(recording.insertedTables, [purchases]);
  assert.equal(recording.insertedRows.length, 1);
});

test('PurchaseRepository propagates duplicate identity failures unchanged', async () => {
  const error = new Error('SQLITE_CONSTRAINT_PRIMARYKEY');
  const recording = new RecordingExecutor(error);

  await assert.rejects(
    () => createSqlitePurchaseRepository(recording.executor).save(purchase()),
    error,
  );
});

test('transaction repositories create PurchaseRepository on the scoped executor', async () => {
  const recording = new RecordingExecutor();
  const repositories = createSqliteTransactionRepositories(recording.executor);

  await repositories.purchaseRepository.save(purchase());

  assert.deepEqual(recording.insertedTables, [purchases]);
});
