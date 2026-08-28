import assert from 'node:assert/strict';
import test from 'node:test';

import { drizzle } from 'drizzle-orm/sqlite-proxy';

import { createSqliteSaleDetailsReader } from '../src/infrastructure/sqlite/repositories/repositories';

const INVENTORY_ID = 'inventory-1';
const SALE_ID = 'sale-1';

interface StoredSale {
  readonly id: string;
  readonly inventoryId: string;
  readonly effectiveAt: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly status: 'CONFIRMED' | 'VOIDED';
  readonly totalAmountUnits: number;
  readonly estimatedCostUnits: number | null;
  readonly estimatedProfitUnits: number | null;
  readonly notes: string | null;
}

interface StoredItem {
  readonly id: string;
  readonly saleId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly unitSalePriceUnits: number;
  readonly subtotalUnits: number;
  readonly unitCostSnapshotUnits: number | null;
  readonly estimatedCostUnits: number | null;
  readonly estimatedProfitUnits: number | null;
  readonly costStatus: 'KNOWN' | 'UNKNOWN';
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly productName: string | null;
  readonly productVariant: string | null;
  readonly isArchived?: boolean;
}

interface RecordedQuery {
  readonly sql: string;
  readonly params: readonly unknown[];
}

function storedSale(overrides: Partial<StoredSale> = {}): StoredSale {
  return {
    id: SALE_ID,
    inventoryId: INVENTORY_ID,
    effectiveAt: 10_000,
    createdAt: 10_001,
    updatedAt: 10_001,
    status: 'CONFIRMED',
    totalAmountUnits: 3_250_000,
    estimatedCostUnits: 2_100_000,
    estimatedProfitUnits: 1_150_000,
    notes: null,
    ...overrides,
  };
}

function storedItem(overrides: Partial<StoredItem> = {}): StoredItem {
  return {
    id: 'item-1',
    saleId: SALE_ID,
    productId: 'product-1',
    quantity: 2,
    unitSalePriceUnits: 1_000_000,
    subtotalUnits: 2_000_000,
    unitCostSnapshotUnits: 700_000,
    estimatedCostUnits: 1_400_000,
    estimatedProfitUnits: 600_000,
    costStatus: 'KNOWN',
    createdAt: 10_001,
    updatedAt: 10_001,
    productName: 'Coca-Cola',
    productVariant: '500 ml',
    ...overrides,
  };
}

function createFixture(
  sales: readonly StoredSale[] = [storedSale()],
  items: readonly StoredItem[] = [storedItem()],
) {
  const queries: RecordedQuery[] = [];
  const database = drizzle(async (sql, params) => {
    queries.push({ sql, params });

    if (sql.includes('from "sales"')) {
      const matching = sales.find(
        (sale) => params.includes(sale.inventoryId) && params.includes(sale.id),
      );

      return {
        rows:
          matching === undefined
            ? []
            : [
                [
                  matching.id,
                  matching.inventoryId,
                  matching.effectiveAt,
                  matching.createdAt,
                  matching.updatedAt,
                  matching.status,
                  matching.totalAmountUnits,
                  matching.estimatedCostUnits,
                  matching.estimatedProfitUnits,
                  matching.notes,
                ],
              ],
      };
    }

    if (sql.includes('from "sale_items"')) {
      return {
        rows: items
          .filter((item) => params.includes(item.saleId))
          .slice()
          .sort((left, right) =>
            left.createdAt === right.createdAt
              ? left.id.localeCompare(right.id)
              : left.createdAt - right.createdAt,
          )
          .map((item) => [
            item.id,
            item.saleId,
            item.productId,
            item.quantity,
            item.unitSalePriceUnits,
            item.subtotalUnits,
            item.unitCostSnapshotUnits,
            item.estimatedCostUnits,
            item.estimatedProfitUnits,
            item.costStatus,
            item.createdAt,
            item.updatedAt,
            item.productName,
            item.productVariant,
          ]),
      };
    }

    throw new Error(`Unexpected Sale details SQL: ${sql}`);
  });

  return {
    queries,
    reader: createSqliteSaleDetailsReader(
      database as unknown as Parameters<
        typeof createSqliteSaleDetailsReader
      >[0],
    ),
  };
}

test('reads one scoped Sale and reconstructs every historical snapshot exactly', async () => {
  const fixture = createFixture();

  const source = await fixture.reader.findById({
    inventoryId: INVENTORY_ID,
    saleId: SALE_ID,
  });

  assert.equal(source?.sale.id, SALE_ID);
  assert.equal(source?.sale.totalAmount.scaledUnits, 3_250_000);
  assert.equal(source?.sale.estimatedCost?.scaledUnits, 2_100_000);
  assert.equal(source?.sale.estimatedProfit?.scaledUnits, 1_150_000);
  assert.equal(source?.sale.effectiveAt, 10_000);
  assert.equal(source?.items[0]?.item.quantity, 2);
  assert.equal(source?.items[0]?.item.unitSalePrice.scaledUnits, 1_000_000);
  assert.equal(source?.items[0]?.item.subtotal.scaledUnits, 2_000_000);
  assert.equal(source?.items[0]?.item.unitCostSnapshot?.scaledUnits, 700_000);
  assert.equal(source?.items[0]?.item.estimatedProfit?.scaledUnits, 600_000);
  assert.equal(source?.items[0]?.productName, 'Coca-Cola');
  assert.equal(source?.items[0]?.productVariant, '500 ml');
});

test('returns null without querying items for missing or other-inventory Sale', async () => {
  const fixture = createFixture();

  const result = await fixture.reader.findById({
    inventoryId: 'inventory-2',
    saleId: SALE_ID,
  });

  assert.equal(result, null);
  assert.equal(fixture.queries.length, 1);
});

test('loads multiple SaleItems with one joined query and deterministic ordering', async () => {
  const fixture = createFixture(
    [storedSale()],
    [
      storedItem({ id: 'item-2', productId: 'product-2' }),
      storedItem({ id: 'item-1', productId: 'product-1' }),
    ],
  );

  const result = await fixture.reader.findById({
    inventoryId: INVENTORY_ID,
    saleId: SALE_ID,
  });

  assert.deepEqual(
    result?.items.map(({ item }) => item.id),
    ['item-1', 'item-2'],
  );
  assert.equal(fixture.queries.length, 2);
  assert.match(fixture.queries[1]?.sql ?? '', /left join "products"/i);
});

test('includes archived Products and never reads current price or InventoryState cost', async () => {
  const fixture = createFixture(
    [storedSale()],
    [storedItem({ isArchived: true })],
  );

  const result = await fixture.reader.findById({
    inventoryId: INVENTORY_ID,
    saleId: SALE_ID,
  });
  const itemQuery = fixture.queries[1]?.sql ?? '';

  assert.equal(result?.items[0]?.productName, 'Coca-Cola');
  assert.doesNotMatch(itemQuery, /is_archived/i);
  assert.doesNotMatch(itemQuery, /regular_sale_price_units/i);
  assert.doesNotMatch(itemQuery, /inventory_states/i);
});

test('preserves known zero and unknown costs without substitution', async () => {
  const fixture = createFixture(
    [storedSale({ estimatedCostUnits: null, estimatedProfitUnits: null })],
    [
      storedItem({
        id: 'item-1',
        unitCostSnapshotUnits: 0,
        estimatedCostUnits: 0,
        estimatedProfitUnits: 2_000_000,
      }),
      storedItem({
        id: 'item-2',
        productId: 'product-2',
        unitCostSnapshotUnits: null,
        estimatedCostUnits: null,
        estimatedProfitUnits: null,
        costStatus: 'UNKNOWN',
      }),
    ],
  );

  const result = await fixture.reader.findById({
    inventoryId: INVENTORY_ID,
    saleId: SALE_ID,
  });

  assert.equal(result?.sale.estimatedProfit, null);
  assert.equal(result?.items[0]?.item.unitCostSnapshot?.scaledUnits, 0);
  assert.equal(result?.items[0]?.item.estimatedProfit?.scaledUnits, 2_000_000);
  assert.equal(result?.items[1]?.item.unitCostSnapshot, null);
  assert.equal(result?.items[1]?.item.estimatedProfit, null);
});

test('keeps the historical line readable when the current Product label is missing', async () => {
  const fixture = createFixture(
    [storedSale()],
    [storedItem({ productName: null, productVariant: null })],
  );

  const result = await fixture.reader.findById({
    inventoryId: INVENTORY_ID,
    saleId: SALE_ID,
  });

  assert.equal(result?.items[0]?.productName, null);
  assert.equal(result?.items[0]?.item.unitSalePrice.scaledUnits, 1_000_000);
});

test('fails explicitly for unsafe Money, timestamps and quantities', async (context) => {
  await context.test('unsafe scaled units', async () => {
    const fixture = createFixture([
      storedSale({ totalAmountUnits: Number.MAX_SAFE_INTEGER + 1 }),
    ]);
    await assert.rejects(
      fixture.reader.findById({ inventoryId: INVENTORY_ID, saleId: SALE_ID }),
      /scaled units must be a safe integer/i,
    );
  });

  await context.test('invalid timestamp', async () => {
    const fixture = createFixture([storedSale({ effectiveAt: -1 })]);
    await assert.rejects(
      fixture.reader.findById({ inventoryId: INVENTORY_ID, saleId: SALE_ID }),
      /effective at/i,
    );
  });

  await context.test('fractional quantity', async () => {
    const fixture = createFixture(
      [storedSale()],
      [storedItem({ quantity: 1.5 })],
    );
    await assert.rejects(
      fixture.reader.findById({ inventoryId: INVENTORY_ID, saleId: SALE_ID }),
      /quantity must be a safe integer/i,
    );
  });
});
