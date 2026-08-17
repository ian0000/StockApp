import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import test from 'node:test';

import type { Inventory, TimestampMs } from '@stock-app/domain';

import {
  CreateInventoryUseCase,
  type Clock,
  type CreateInventoryInput,
  type InventoryIdGenerator,
  type InventoryRepository,
} from '../src/index';

const FIRST_TIME = 1_776_444_000_000;
const SECOND_TIME = 1_776_444_001_000;

class SequenceInventoryIdGenerator implements InventoryIdGenerator {
  calls = 0;

  constructor(private readonly ids: readonly string[]) {}

  generate(): string {
    const id = this.ids[this.calls++];

    if (id === undefined) {
      throw new Error('Inventory ID sequence exhausted.');
    }

    return id;
  }
}

class SequenceClock implements Clock {
  calls = 0;

  constructor(private readonly values: readonly TimestampMs[]) {}

  now(): TimestampMs {
    const value = this.values[this.calls++];

    if (value === undefined) {
      throw new Error('Clock sequence exhausted.');
    }

    return value;
  }
}

class RecordingInventoryRepository implements InventoryRepository {
  readonly calls: Inventory[] = [];

  constructor(
    private readonly saveImplementation: (
      inventory: Inventory,
    ) => Promise<void> = async () => {},
  ) {}

  async save(inventory: Inventory): Promise<void> {
    this.calls.push(inventory);
    await this.saveImplementation(inventory);
  }
}

function validInput(
  overrides: Partial<CreateInventoryInput> = {},
): CreateInventoryInput {
  return {
    name: 'Mi Negocio',
    currency: 'USD',
    ...overrides,
  };
}

function createHarness({
  ids = ['inventory-1'],
  times = [FIRST_TIME],
  repository = new RecordingInventoryRepository(),
}: {
  readonly ids?: readonly string[];
  readonly times?: readonly TimestampMs[];
  readonly repository?: RecordingInventoryRepository;
} = {}) {
  const inventoryIdGenerator = new SequenceInventoryIdGenerator(ids);
  const clock = new SequenceClock(times);
  const useCase = new CreateInventoryUseCase({
    inventoryIdGenerator,
    clock,
    inventoryRepository: repository,
  });

  return { clock, inventoryIdGenerator, repository, useCase };
}

test('creates a valid Inventory', async () => {
  const { useCase } = createHarness();

  const inventory = await useCase.execute(validInput());

  assert.deepEqual(inventory, {
    id: 'inventory-1',
    name: 'Mi Negocio',
    currency: 'USD',
    createdAt: FIRST_TIME,
    updatedAt: FIRST_TIME,
  });
});

test('execute returns a Promise', async () => {
  const { useCase } = createHarness();

  const execution = useCase.execute(validInput());

  assert.ok(execution instanceof Promise);
  await execution;
});

test('generates an Inventory ID exactly once', async () => {
  const { inventoryIdGenerator, useCase } = createHarness();

  await useCase.execute(validInput());

  assert.equal(inventoryIdGenerator.calls, 1);
});

test('uses the generated Inventory ID', async () => {
  const { useCase } = createHarness({ ids: ['inventory-generated-123'] });

  const inventory = await useCase.execute(validInput());

  assert.equal(inventory.id, 'inventory-generated-123');
});

test('calls Clock exactly once for a valid creation', async () => {
  const { clock, useCase } = createHarness();

  await useCase.execute(validInput());

  assert.equal(clock.calls, 1);
});

test('uses Clock for createdAt', async () => {
  const { useCase } = createHarness({ times: [SECOND_TIME] });

  const inventory = await useCase.execute(validInput());

  assert.equal(inventory.createdAt, SECOND_TIME);
});

test('uses the same Clock value for updatedAt', async () => {
  const { useCase } = createHarness({ times: [SECOND_TIME] });

  const inventory = await useCase.execute(validInput());

  assert.equal(inventory.updatedAt, inventory.createdAt);
  assert.equal(inventory.updatedAt, SECOND_TIME);
});

test('propagates the inventory name through Domain', async () => {
  const { useCase } = createHarness();

  const inventory = await useCase.execute(
    validInput({ name: '  Tienda Central  ' }),
  );

  assert.equal(inventory.name, 'Tienda Central');
});

test('delegates currency normalization to Domain', async () => {
  const { useCase } = createHarness();

  const inventory = await useCase.execute(validInput({ currency: ' usd ' }));

  assert.equal(inventory.currency, 'USD');
});

test('calls InventoryRepository exactly once', async () => {
  const { repository, useCase } = createHarness();

  await useCase.execute(validInput());

  assert.equal(repository.calls.length, 1);
});

test('passes the created Inventory to the repository', async () => {
  const { repository, useCase } = createHarness();

  const inventory = await useCase.execute(validInput());

  assert.deepEqual(repository.calls[0], inventory);
});

test('returns the exact Inventory object that was persisted', async () => {
  const { repository, useCase } = createHarness();

  const inventory = await useCase.execute(validInput());

  assert.strictEqual(inventory, repository.calls[0]);
});

test('waits for repository save before resolving', async () => {
  let releaseSave: (() => void) | undefined;
  let resolved = false;
  const repository = new RecordingInventoryRepository(
    () =>
      new Promise<void>((resolve) => {
        releaseSave = resolve;
      }),
  );
  const { useCase } = createHarness({ repository });

  const execution = useCase.execute(validInput()).then((inventory) => {
    resolved = true;
    return inventory;
  });
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.equal(repository.calls.length, 1);
  assert.equal(resolved, false);
  releaseSave?.();
  await execution;
  assert.equal(resolved, true);
});

test('invalid name fails before repository persistence', async () => {
  const { repository, useCase } = createHarness();

  await assert.rejects(
    () => useCase.execute(validInput({ name: '   ' })),
    /inventory name.*empty/i,
  );
  assert.equal(repository.calls.length, 0);
});

test('invalid currency fails before repository persistence', async () => {
  const { repository, useCase } = createHarness();

  await assert.rejects(
    () => useCase.execute(validInput({ currency: 'US1' })),
    /inventory currency.*three ASCII letters/i,
  );
  assert.equal(repository.calls.length, 0);
});

test('propagates the original repository error', async () => {
  const error = new Error('inventory save failed');
  const repository = new RecordingInventoryRepository(async () => {
    throw error;
  });
  const { useCase } = createHarness({ repository });

  await assert.rejects(() => useCase.execute(validInput()), error);
});

test('does not retry a failed repository save', async () => {
  const error = new Error('inventory save failed');
  const repository = new RecordingInventoryRepository(async () => {
    throw error;
  });
  const { useCase } = createHarness({ repository });

  await assert.rejects(() => useCase.execute(validInput()), error);
  assert.equal(repository.calls.length, 1);
});

test('two executions request independent Inventory IDs', async () => {
  const { inventoryIdGenerator, useCase } = createHarness({
    ids: ['inventory-1', 'inventory-2'],
    times: [FIRST_TIME, SECOND_TIME],
  });

  const first = await useCase.execute(validInput());
  const second = await useCase.execute(validInput());

  assert.equal(first.id, 'inventory-1');
  assert.equal(second.id, 'inventory-2');
  assert.equal(inventoryIdGenerator.calls, 2);
});

test('two executions call Clock independently', async () => {
  const { clock, useCase } = createHarness({
    ids: ['inventory-1', 'inventory-2'],
    times: [FIRST_TIME, SECOND_TIME],
  });

  const first = await useCase.execute(validInput());
  const second = await useCase.execute(validInput());

  assert.equal(first.createdAt, FIRST_TIME);
  assert.equal(second.createdAt, SECOND_TIME);
  assert.equal(clock.calls, 2);
});

test('does not mutate the input', async () => {
  const input = validInput({
    name: '  Mi Negocio  ',
    currency: ' usd ',
  });
  const original = { ...input };
  const { useCase } = createHarness();

  await useCase.execute(input);

  assert.deepEqual(input, original);
});

test('Application has no SQLite dependency', () => {
  const packageJson = readFileSync(
    new URL('../package.json', import.meta.url),
    'utf8',
  );

  assert.equal(packageJson.toLowerCase().includes('sqlite'), false);
});

test('Domain has no dependency on Application', () => {
  const domainSource = new URL('../../domain/src/', import.meta.url);
  const pending = [domainSource];
  const sourceFiles: URL[] = [];

  while (pending.length > 0) {
    const directory = pending.pop();
    assert.ok(directory !== undefined);

    for (const entry of readdirSync(directory)) {
      const path = new URL(entry, directory);

      if (statSync(path).isDirectory()) {
        pending.push(new URL(`${entry}/`, directory));
      } else if (entry.endsWith('.ts')) {
        sourceFiles.push(path);
      }
    }
  }

  const source = sourceFiles
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');

  assert.equal(source.includes('@stock-app/application'), false);
});
