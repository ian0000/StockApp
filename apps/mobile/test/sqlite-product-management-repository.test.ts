import assert from 'node:assert/strict';
import test from 'node:test';

import { archiveProduct, createProduct, Money } from '@stock-app/domain';

import { createSqliteProductRepository } from '../src/infrastructure/sqlite/repositories/repositories';
import { products } from '../src/infrastructure/sqlite/schema';

const TIMESTAMP = 1_776_444_000_000;
type ProductRow = typeof products.$inferSelect;
type RepositoryExecutor = Parameters<typeof createSqliteProductRepository>[0];

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
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

class RecordingProductExecutor {
  readonly selectedTables: unknown[] = [];
  readonly updatedTables: unknown[] = [];
  readonly updatedValues: unknown[] = [];
  readonly whereExpressions: unknown[] = [];
  readonly executor: RepositoryExecutor;

  constructor(
    private readonly rows: readonly ProductRow[] = [],
    private readonly updateChanges = 1,
    private readonly writeError: Error | null = null,
  ) {
    this.executor = {
      insert: (() => {
        throw new Error('Product management must not insert.');
      }) as RepositoryExecutor['insert'],
      select: (() => ({
        from: (table: unknown) => {
          this.selectedTables.push(table);
          return {
            where: (expression: unknown) => {
              this.whereExpressions.push(expression);
              return {
                limit: (limit: number) =>
                  Promise.resolve(this.rows.slice(0, limit)),
                orderBy: () => Promise.resolve(this.rows),
              };
            },
          };
        },
      })) as unknown as RepositoryExecutor['select'],
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

test('ProductRepository finds an active Product by Inventory and Product identity', async () => {
  const recording = new RecordingProductExecutor([productRow()]);
  const repository = createSqliteProductRepository(recording.executor);

  const result = await repository.findById('inventory-123', 'product-123');

  assert.deepEqual(recording.selectedTables, [products]);
  assert.equal(recording.whereExpressions.length, 1);
  assert.equal(result?.id, 'product-123');
  assert.equal(result?.inventoryId, 'inventory-123');
  assert.equal(result?.barcode, '0012345');
});

test('ProductRepository finds an archived Product for idempotent management', async () => {
  const repository = createSqliteProductRepository(
    new RecordingProductExecutor([
      productRow({ isArchived: true, barcode: '000001' }),
    ]).executor,
  );

  const result = await repository.findById('inventory-123', 'product-123');

  assert.equal(result?.isArchived, true);
  assert.equal(result?.barcode, '000001');
});

test('ProductRepository returns null when the scoped Product does not exist', async () => {
  const repository = createSqliteProductRepository(
    new RecordingProductExecutor([]).executor,
  );

  assert.equal(
    await repository.findById('inventory-123', 'missing-product'),
    null,
  );
});

test('ProductRepository updates only mutable Product columns', async () => {
  const recording = new RecordingProductExecutor();
  const repository = createSqliteProductRepository(recording.executor);
  const updated = createProduct({
    id: 'product-123',
    inventoryId: 'inventory-123',
    name: 'Coca-Cola Zero',
    variant: null,
    barcode: '0009876',
    regularSalePrice: Money.fromDecimal('1.250001'),
    minimumStock: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP + 1,
  });

  await repository.update(updated);

  assert.deepEqual(recording.updatedTables, [products]);
  assert.deepEqual(recording.updatedValues, [
    {
      name: 'Coca-Cola Zero',
      variant: null,
      barcode: '0009876',
      regularSalePriceUnits: 1_250_001,
      minimumStock: null,
      isArchived: false,
      updatedAt: TIMESTAMP + 1,
    },
  ]);
  assert.equal(recording.whereExpressions.length, 1);
  assert.equal('id' in (recording.updatedValues[0] as object), false);
  assert.equal('inventoryId' in (recording.updatedValues[0] as object), false);
  assert.equal('createdAt' in (recording.updatedValues[0] as object), false);
});

test('ProductRepository archives through UPDATE and has no DELETE capability', async () => {
  const recording = new RecordingProductExecutor();
  const repository = createSqliteProductRepository(recording.executor);
  const active = createProduct({
    id: 'product-123',
    inventoryId: 'inventory-123',
    name: 'Coca-Cola',
    regularSalePrice: Money.fromDecimal('1'),
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  });

  await repository.update(archiveProduct(active, TIMESTAMP + 1));

  assert.equal(
    (recording.updatedValues[0] as { isArchived: boolean }).isArchived,
    true,
  );
  assert.equal('delete' in recording.executor, false);
});

test('ProductRepository fails when the target Product was not updated', async () => {
  const recording = new RecordingProductExecutor([], 0);
  const repository = createSqliteProductRepository(recording.executor);
  const updated = createProduct({
    id: 'missing-product',
    inventoryId: 'inventory-123',
    name: 'Missing',
    regularSalePrice: Money.zero(),
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  });

  await assert.rejects(
    () => repository.update(updated),
    /Expected to update one Product, updated 0/,
  );
});

test('ProductRepository propagates SQLite update failures unchanged', async () => {
  const error = new Error('SQLITE_CONSTRAINT_UNIQUE');
  const repository = createSqliteProductRepository(
    new RecordingProductExecutor([], 1, error).executor,
  );
  const updated = createProduct({
    id: 'product-123',
    inventoryId: 'inventory-123',
    name: 'Coca-Cola',
    regularSalePrice: Money.zero(),
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  });

  await assert.rejects(
    () => repository.update(updated),
    (caught) => {
      return caught === error;
    },
  );
});
