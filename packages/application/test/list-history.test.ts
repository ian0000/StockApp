import assert from 'node:assert/strict';
import test from 'node:test';

import { Money, type TimestampMs } from '@stock-app/domain';

import {
  compareHistoryEntriesNewestFirst,
  ListHistoryUseCase,
  type HistoryEntry,
  type HistoryReader,
  type ListHistoryReaderInput,
} from '../src/index';

const EFFECTIVE_AT = 1_776_444_000_000 as TimestampMs;
const CREATED_AT = 1_776_444_000_100 as TimestampMs;

function saleEntry(
  overrides: Partial<Extract<HistoryEntry, { type: 'SALE' }>> = {},
): Extract<HistoryEntry, { type: 'SALE' }> {
  return Object.freeze({
    type: 'SALE',
    id: 'sale-1',
    totalAmount: Money.fromDecimal('12.5'),
    units: 4,
    status: 'CONFIRMED',
    effectiveAt: EFFECTIVE_AT,
    createdAt: CREATED_AT,
    ...overrides,
  });
}

function purchaseEntry(
  overrides: Partial<Extract<HistoryEntry, { type: 'PURCHASE' }>> = {},
): Extract<HistoryEntry, { type: 'PURCHASE' }> {
  return Object.freeze({
    type: 'PURCHASE',
    id: 'purchase-1',
    productId: 'product-1',
    productName: 'Coca-Cola',
    productVariant: '500 ml',
    quantity: 10,
    unitCost: Money.fromDecimal('1.2'),
    totalAmount: Money.fromDecimal('12'),
    status: 'CONFIRMED',
    effectiveAt: EFFECTIVE_AT,
    createdAt: CREATED_AT,
    ...overrides,
  });
}

class StubHistoryReader implements HistoryReader {
  readonly calls: ListHistoryReaderInput[] = [];

  constructor(
    private readonly entries: readonly HistoryEntry[] = [],
    private readonly error: Error | null = null,
  ) {}

  async listRecent(
    input: ListHistoryReaderInput,
  ): Promise<readonly HistoryEntry[]> {
    this.calls.push(input);

    if (this.error !== null) {
      throw this.error;
    }

    return this.entries;
  }
}

test('uses the canonical 50-entry default and trims inventory ID', async () => {
  const reader = new StubHistoryReader();
  const useCase = new ListHistoryUseCase(reader);

  await useCase.execute({ inventoryId: '  inventory-1  ' });

  assert.deepEqual(reader.calls, [{ inventoryId: 'inventory-1', limit: 50 }]);
});

test('delegates an explicit valid limit', async () => {
  const reader = new StubHistoryReader();
  const useCase = new ListHistoryUseCase(reader);

  await useCase.execute({ inventoryId: 'inventory-1', limit: 3 });

  assert.deepEqual(reader.calls, [{ inventoryId: 'inventory-1', limit: 3 }]);
});

test('rejects an empty inventory ID without reading', async () => {
  const reader = new StubHistoryReader();
  const useCase = new ListHistoryUseCase(reader);

  await assert.rejects(
    () => useCase.execute({ inventoryId: '   ' }),
    /Inventory ID must not be empty/,
  );
  assert.equal(reader.calls.length, 0);
});

for (const limit of [0, -1, 1.5, 51, Number.MAX_SAFE_INTEGER + 1]) {
  test(`rejects invalid history limit ${limit}`, async () => {
    const reader = new StubHistoryReader();
    const useCase = new ListHistoryUseCase(reader);

    await assert.rejects(
      () => useCase.execute({ inventoryId: 'inventory-1', limit }),
      RangeError,
    );
    assert.equal(reader.calls.length, 0);
  });
}

test('preserves the exact reader result without mutation', async () => {
  const entries = Object.freeze([saleEntry(), purchaseEntry()]);
  const useCase = new ListHistoryUseCase(new StubHistoryReader(entries));

  const result = await useCase.execute({ inventoryId: 'inventory-1' });

  assert.equal(result, entries);
  assert.deepEqual(result, entries);
});

test('propagates reader failures unchanged', async () => {
  const error = new Error('history read failed');
  const useCase = new ListHistoryUseCase(new StubHistoryReader([], error));

  await assert.rejects(
    () => useCase.execute({ inventoryId: 'inventory-1' }),
    error,
  );
});

test('orders different effective timestamps descending', () => {
  const entries: HistoryEntry[] = [
    saleEntry({ id: 'older', effectiveAt: EFFECTIVE_AT - 1 }),
    purchaseEntry({ id: 'newer', effectiveAt: EFFECTIVE_AT + 1 }),
  ];

  entries.sort(compareHistoryEntriesNewestFirst);

  assert.deepEqual(
    entries.map(({ id }) => id),
    ['newer', 'older'],
  );
});

test('uses createdAt descending when effectiveAt is equal', () => {
  const entries: HistoryEntry[] = [
    saleEntry({ id: 'created-first', createdAt: CREATED_AT - 1 }),
    purchaseEntry({ id: 'created-last', createdAt: CREATED_AT + 1 }),
  ];

  entries.sort(compareHistoryEntriesNewestFirst);

  assert.deepEqual(
    entries.map(({ id }) => id),
    ['created-last', 'created-first'],
  );
});

test('uses raw ID descending when both timestamps are equal', () => {
  const entries: HistoryEntry[] = [
    saleEntry({ id: 'operation-a' }),
    purchaseEntry({ id: 'operation-z' }),
  ];

  entries.sort(compareHistoryEntriesNewestFirst);

  assert.deepEqual(
    entries.map(({ id }) => id),
    ['operation-z', 'operation-a'],
  );
});

test('comparator is stable at equality without locale-sensitive ordering', () => {
  const entry = saleEntry();

  assert.equal(compareHistoryEntriesNewestFirst(entry, entry), 0);
});
