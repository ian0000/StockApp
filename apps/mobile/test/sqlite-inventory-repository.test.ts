import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createInventory, type Inventory } from '@stock-app/domain';

import { mapInventoryToRow } from '../src/infrastructure/sqlite/repositories/mappers';
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

type InventoryInsertExecutor = Parameters<typeof createInventoryRepository>[0];

class RecordingInsertExecutor {
  readonly events: string[] = [];
  readonly rows: unknown[] = [];
  readonly tables: unknown[] = [];
  runs = 0;

  readonly executor: InventoryInsertExecutor;

  constructor(private readonly runError: Error | null = null) {
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
      }) as InventoryInsertExecutor['insert'],
    };
  }
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

test('InventoryRepository save performs one insert into inventories', async () => {
  const recording = new RecordingInsertExecutor();
  const repository = createInventoryRepository(recording.executor);

  await repository.save(createValidInventory());

  assert.equal(recording.tables.length, 1);
  assert.strictEqual(recording.tables[0], inventories);
  assert.equal(recording.runs, 1);
});

test('InventoryRepository uses strict insert semantics without upsert', async () => {
  const recording = new RecordingInsertExecutor();
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
  const recording = new RecordingInsertExecutor(error);
  const repository = createInventoryRepository(recording.executor);

  await assert.rejects(() => repository.save(createValidInventory()), error);
});

test('InventoryRepository does not mutate Inventory', async () => {
  const inventory = createValidInventory();
  const snapshot = { ...inventory };
  const recording = new RecordingInsertExecutor();
  const repository = createInventoryRepository(recording.executor);

  await repository.save(inventory);

  assert.deepEqual(inventory, snapshot);
  assert.deepEqual(recording.rows[0], snapshot);
});
