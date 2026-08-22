import assert from 'node:assert/strict';
import test from 'node:test';

import { drizzle } from 'drizzle-orm/sqlite-proxy';

import type { GetSalesSummaryInput } from '@stock-app/application';

import { createSqliteSalesSummaryReader } from '../src/infrastructure/sqlite/repositories/repositories';

const INVENTORY_ID = 'inventory-123';
const FROM = 1_000;
const TO = 2_000;

interface StoredSale {
  readonly id: string;
  readonly inventoryId: string;
  readonly effectiveAt: number;
  readonly status: 'CONFIRMED' | 'VOIDED';
  readonly totalAmountUnits: number;
  readonly estimatedProfitUnits: number | null;
}

interface StoredSaleItem {
  readonly saleId: string;
  readonly quantity: number;
}

interface RecordedQuery {
  readonly sql: string;
  readonly params: readonly unknown[];
  readonly method: string;
}

const INPUT: GetSalesSummaryInput = {
  inventoryId: INVENTORY_ID,
  fromInclusive: FROM,
  toExclusive: TO,
};

function sum(values: readonly number[]): number | null {
  return values.length === 0
    ? null
    : values.reduce((total, value) => total + value, 0);
}

function createFixture(
  storedSales: readonly StoredSale[] = [],
  storedItems: readonly StoredSaleItem[] = [],
) {
  const queries: RecordedQuery[] = [];
  const database = drizzle(async (sql, params, method) => {
    queries.push({ sql, params, method });

    const [inventoryId, status, fromInclusive, toExclusive] = params;
    const matchingSales = storedSales.filter(
      (sale) =>
        sale.inventoryId === inventoryId &&
        sale.status === status &&
        sale.effectiveAt >= Number(fromInclusive) &&
        sale.effectiveAt < Number(toExclusive),
    );

    if (sql.includes('inner join "sales"')) {
      const matchingIds = new Set(matchingSales.map(({ id }) => id));
      return {
        rows: [
          [
            sum(
              storedItems
                .filter(({ saleId }) => matchingIds.has(saleId))
                .map(({ quantity }) => quantity),
            ),
          ],
        ],
      };
    }

    const knownProfits = matchingSales.flatMap(({ estimatedProfitUnits }) =>
      estimatedProfitUnits === null ? [] : [estimatedProfitUnits],
    );

    return {
      rows: [
        [
          matchingSales.length,
          knownProfits.length,
          sum(matchingSales.map(({ totalAmountUnits }) => totalAmountUnits)),
          sum(knownProfits),
        ],
      ],
    };
  });

  return {
    queries,
    // The proxy is async while expo-sqlite's Drizzle driver is sync, but both
    // expose the same select query surface exercised by this read-only adapter.
    reader: createSqliteSalesSummaryReader(
      database as unknown as Parameters<
        typeof createSqliteSalesSummaryReader
      >[0],
    ),
  };
}

function sale(overrides: Partial<StoredSale> = {}): StoredSale {
  return {
    id: 'sale-1',
    inventoryId: INVENTORY_ID,
    effectiveAt: 1_500,
    status: 'CONFIRMED',
    totalAmountUnits: 1_750_000,
    estimatedProfitUnits: 400_000,
    ...overrides,
  };
}

test('returns exact zero Money and units when no confirmed sales exist', async () => {
  const { reader } = createFixture();

  const result = await reader.getSummary(INPUT);

  assert.equal(result.totalAmount.scaledUnits, 0);
  assert.equal(result.estimatedProfit?.scaledUnits, 0);
  assert.equal(result.unitsSold, 0);
});

test('aggregates one confirmed sale and its items', async () => {
  const { reader } = createFixture(
    [sale()],
    [
      { saleId: 'sale-1', quantity: 2 },
      { saleId: 'sale-1', quantity: 1 },
    ],
  );

  const result = await reader.getSummary(INPUT);

  assert.equal(result.totalAmount.scaledUnits, 1_750_000);
  assert.equal(result.estimatedProfit?.scaledUnits, 400_000);
  assert.equal(result.unitsSold, 3);
});

test('aggregates multiple confirmed sales and SaleItems exactly', async () => {
  const { reader } = createFixture(
    [
      sale({ id: 'sale-a', totalAmountUnits: 1_000_000 }),
      sale({
        id: 'sale-b',
        totalAmountUnits: 2_500_000,
        estimatedProfitUnits: 750_000,
      }),
    ],
    [
      { saleId: 'sale-a', quantity: 2 },
      { saleId: 'sale-b', quantity: 3 },
    ],
  );

  const result = await reader.getSummary(INPUT);

  assert.equal(result.totalAmount.scaledUnits, 3_500_000);
  assert.equal(result.estimatedProfit?.scaledUnits, 1_150_000);
  assert.equal(result.unitsSold, 5);
});

test('includes fromInclusive and excludes before-range and toExclusive sales', async () => {
  const { reader } = createFixture(
    [
      sale({ id: 'before', effectiveAt: FROM - 1 }),
      sale({ id: 'included', effectiveAt: FROM }),
      sale({ id: 'excluded-to', effectiveAt: TO }),
    ],
    [
      { saleId: 'before', quantity: 9 },
      { saleId: 'included', quantity: 2 },
      { saleId: 'excluded-to', quantity: 9 },
    ],
  );

  const result = await reader.getSummary(INPUT);

  assert.equal(result.totalAmount.scaledUnits, 1_750_000);
  assert.equal(result.unitsSold, 2);
});

test('excludes VOIDED and other-inventory sales from both aggregates', async () => {
  const { reader } = createFixture(
    [
      sale({ id: 'confirmed' }),
      sale({ id: 'voided', status: 'VOIDED' }),
      sale({ id: 'other', inventoryId: 'inventory-other' }),
    ],
    [
      { saleId: 'confirmed', quantity: 1 },
      { saleId: 'voided', quantity: 8 },
      { saleId: 'other', quantity: 8 },
    ],
  );

  const result = await reader.getSummary(INPUT);

  assert.equal(result.totalAmount.scaledUnits, 1_750_000);
  assert.equal(result.unitsSold, 1);
});

test('returns unknown daily profit when any confirmed sale has unknown profit', async () => {
  const { reader } = createFixture([
    sale({ id: 'known' }),
    sale({ id: 'unknown', estimatedProfitUnits: null }),
  ]);

  const result = await reader.getSummary(INPUT);

  assert.equal(result.totalAmount.scaledUnits, 3_500_000);
  assert.equal(result.estimatedProfit, null);
});

test('preserves an exact known negative profit aggregate', async () => {
  const { reader } = createFixture([sale({ estimatedProfitUnits: -200_000 })]);

  const result = await reader.getSummary(INPUT);

  assert.equal(result.estimatedProfit?.scaledUnits, -200_000);
});

test('uses integer aggregate SQL with explicit confirmed and range filters', async () => {
  const { reader, queries } = createFixture([sale()]);

  await reader.getSummary(INPUT);

  assert.equal(queries.length, 2);
  assert.ok(queries.every(({ method }) => method === 'all'));
  assert.ok(
    queries.every(({ sql }) => sql.includes('"sales"."inventory_id" = ?')),
  );
  assert.ok(queries.every(({ sql }) => sql.includes('"sales"."status" = ?')));
  assert.ok(
    queries.every(({ sql }) => sql.includes('"sales"."effective_at" >= ?')),
  );
  assert.ok(
    queries.every(({ sql }) => sql.includes('"sales"."effective_at" < ?')),
  );
  assert.ok(queries.every(({ sql }) => !/date|strftime|localtime/i.test(sql)));
  assert.deepEqual(queries[0]?.params, [INVENTORY_ID, 'CONFIRMED', FROM, TO]);
});

test('fails explicitly when a Money aggregate exceeds safe integer range', async () => {
  const { reader } = createFixture([
    sale({ id: 'sale-a', totalAmountUnits: Number.MAX_SAFE_INTEGER }),
    sale({ id: 'sale-b', totalAmountUnits: Number.MAX_SAFE_INTEGER }),
  ]);

  await assert.rejects(() => reader.getSummary(INPUT), /safe integer/);
});

test('fails explicitly when the units aggregate exceeds safe integer range', async () => {
  const { reader } = createFixture(
    [sale()],
    [
      { saleId: 'sale-1', quantity: Number.MAX_SAFE_INTEGER },
      { saleId: 'sale-1', quantity: Number.MAX_SAFE_INTEGER },
    ],
  );

  await assert.rejects(() => reader.getSummary(INPUT), /safe integer/);
});
