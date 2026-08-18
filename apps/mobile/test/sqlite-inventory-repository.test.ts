import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createInventory, type Inventory } from '@stock-app/domain';

import {
  mapInventoryRowToDomain,
  mapInventoryToRow,
} from '../src/infrastructure/sqlite/repositories/mappers';
import { createInventoryRepository } from '../src/infrastructure/sqlite/repositories/repositories';
import { inventories } from '../src/infrastructure/sqlite/schema';

const CREATED_AT = 1_776_444_000_000;
const UPDATED_AT = 1_776_444_001_000;

function createValidInventory(): Inventory {
  return createInventory({
    id: '019cf123-4567-7890-abcd-ef1234567890',
    name: 'Mi Negocio',
    currency: 'USD',
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  });
}

type InventoryRepositoryExecutor = Parameters<
  typeof createInventoryRepository
>[0];
type InventoryRow = typeof inventories.$inferSelect;

class RecordingInventoryExecutor {
  readonly events: string[] = [];
  readonly rows: unknown[] = [];
  readonly selectTables: unknown[] = [];
  readonly tables: unknown[] = [];
  runs = 0;

  readonly executor: InventoryRepositoryExecutor;

  constructor(
    private readonly selectedRows: readonly InventoryRow[] = [],
    private readonly runError: Error | null = null,
    private readonly selectError: Error | null = null,
  ) {
    this.executor = {
      insert: ((table: unknown) => {
        this.events.push('insert');
        this.tables.push(table);

        return {
          values: (row: unknown) => {
            this.events.push('values');
            this.rows.push(row);

            return {
              run: () => {
                this.events.push('run');
                this.runs += 1;

                if (this.runError !== null) {
                  throw this.runError;
                }
              },
            };
          },
        };
      }) as InventoryRepositoryExecutor['insert'],
      select: (() => ({
        from: (table: unknown) => {
          this.selectTables.push(table);

          if (this.selectError !== null) {
            return Promise.reject(this.selectError);
          }

          return Promise.resolve(this.selectedRows);
        },
      })) as unknown as InventoryRepositoryExecutor['select'],
    };
  }
}

function createValidRow(overrides: Partial<InventoryRow> = {}): InventoryRow {
  return {
    id: '019cf123-4567-7890-abcd-ef1234567890',
    name: 'Mi Negocio',
    currency: 'USD',
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

test('Inventory mapper preserves id', () => {
  assert.equal(
    mapInventoryToRow(createValidInventory()).id,
    '019cf123-4567-7890-abcd-ef1234567890',
  );
});

test('Inventory mapper preserves name', () => {
  assert.equal(mapInventoryToRow(createValidInventory()).name, 'Mi Negocio');
});

test('Inventory mapper preserves canonical currency', () => {
  assert.equal(mapInventoryToRow(createValidInventory()).currency, 'USD');
});

test('Inventory mapper preserves createdAt exactly', () => {
  assert.equal(mapInventoryToRow(createValidInventory()).createdAt, CREATED_AT);
});

test('Inventory mapper preserves updatedAt exactly', () => {
  assert.equal(mapInventoryToRow(createValidInventory()).updatedAt, UPDATED_AT);
});

test('Inventory mapper does not mutate Inventory', () => {
  const inventory = createValidInventory();
  const snapshot = { ...inventory };

  mapInventoryToRow(inventory);

  assert.deepEqual(inventory, snapshot);
});

test('Inventory mapper produces exactly the inventories insert shape', () => {
  assert.deepEqual(
    Object.keys(mapInventoryToRow(createValidInventory())).sort(),
    ['createdAt', 'currency', 'id', 'name', 'updatedAt'],
  );
});

test('Inventory row mapper reconstructs every Domain field', () => {
  assert.deepEqual(mapInventoryRowToDomain(createValidRow()), {
    id: '019cf123-4567-7890-abcd-ef1234567890',
    name: 'Mi Negocio',
    currency: 'USD',
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  });
});

test('Inventory row mapper validates and normalizes through Domain', () => {
  const inventory = mapInventoryRowToDomain(
    createValidRow({ name: '  Tienda Central  ', currency: 'usd' }),
  );

  assert.equal(inventory.name, 'Tienda Central');
  assert.equal(inventory.currency, 'USD');
  assert.equal(Object.isFrozen(inventory), true);
});

test('InventoryRepository save performs one insert into inventories', async () => {
  const recording = new RecordingInventoryExecutor();
  const repository = createInventoryRepository(recording.executor);

  await repository.save(createValidInventory());

  assert.equal(recording.tables.length, 1);
  assert.strictEqual(recording.tables[0], inventories);
  assert.equal(recording.runs, 1);
});

test('InventoryRepository uses strict insert semantics without upsert', async () => {
  const recording = new RecordingInventoryExecutor();
  const repository = createInventoryRepository(recording.executor);

  await repository.save(createValidInventory());

  assert.deepEqual(recording.events, ['insert', 'values', 'run']);
  const source = readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../src/infrastructure/sqlite/repositories/repositories.ts',
    ),
    'utf8',
  );
  assert.doesNotMatch(
    source,
    /onConflictDoNothing|onConflictDoUpdate|insert\s+or\s+replace/i,
  );
});

test('InventoryRepository propagates insert errors', async () => {
  const error = new Error('SQLITE_CONSTRAINT_PRIMARYKEY');
  const recording = new RecordingInventoryExecutor([], error);
  const repository = createInventoryRepository(recording.executor);

  await assert.rejects(() => repository.save(createValidInventory()), error);
});

test('InventoryRepository does not mutate Inventory', async () => {
  const inventory = createValidInventory();
  const snapshot = { ...inventory };
  const recording = new RecordingInventoryExecutor();
  const repository = createInventoryRepository(recording.executor);

  await repository.save(inventory);

  assert.deepEqual(inventory, snapshot);
  assert.deepEqual(recording.rows[0], snapshot);
});

test('InventoryRepository list reads from inventories', async () => {
  const recording = new RecordingInventoryExecutor([]);
  const repository = createInventoryRepository(recording.executor);

  await repository.list();

  assert.deepEqual(recording.selectTables, [inventories]);
});

test('InventoryRepository list returns an empty list', async () => {
  const recording = new RecordingInventoryExecutor([]);
  const repository = createInventoryRepository(recording.executor);

  assert.deepEqual(await repository.list(), []);
});

test('InventoryRepository list reconstructs one Domain Inventory', async () => {
  const recording = new RecordingInventoryExecutor([
    createValidRow({ name: 'Smoke Shop' }),
  ]);
  const repository = createInventoryRepository(recording.executor);

  const result = await repository.list();

  assert.equal(result.length, 1);
  assert.deepEqual(result[0], {
    id: '019cf123-4567-7890-abcd-ef1234567890',
    name: 'Smoke Shop',
    currency: 'USD',
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  });
});

test('InventoryRepository list returns every Inventory for explicit V1 handling', async () => {
  const recording = new RecordingInventoryExecutor([
    createValidRow({ id: 'inventory-1' }),
    createValidRow({ id: 'inventory-2', name: 'Otra tienda' }),
  ]);
  const repository = createInventoryRepository(recording.executor);

  const result = await repository.list();

  assert.deepEqual(
    result.map(({ id }) => id),
    ['inventory-1', 'inventory-2'],
  );
});

test('InventoryRepository list does not mutate SQLite rows', async () => {
  const row = createValidRow();
  const snapshot = { ...row };
  const recording = new RecordingInventoryExecutor([row]);
  const repository = createInventoryRepository(recording.executor);

  await repository.list();

  assert.deepEqual(row, snapshot);
});

test('InventoryRepository list propagates select errors', async () => {
  const error = new Error('SQLITE_READ_FAILED');
  const recording = new RecordingInventoryExecutor([], null, error);
  const repository = createInventoryRepository(recording.executor);

  await assert.rejects(() => repository.list(), error);
});
