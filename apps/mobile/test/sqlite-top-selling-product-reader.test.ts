import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';

import { drizzle } from 'drizzle-orm/sqlite-proxy';

import type { GetTopSellingProductInput } from '@stock-app/application';

import { createSqliteTopSellingProductReader } from '../src/infrastructure/sqlite/repositories/repositories';

const INVENTORY_ID = 'inventory-1';
const FROM = 1_000;
const TO = 2_000;
const INPUT: GetTopSellingProductInput = {
  inventoryId: INVENTORY_ID,
  fromInclusive: FROM,
  toExclusive: TO,
};
const MIGRATION_FILES = [
  '0000_cool_purple_man.sql',
  '0001_confused_naoko.sql',
  '0002_absent_goblin_queen.sql',
  '0003_sparkling_nuke.sql',
] as const;

interface StoredProduct {
  readonly id: string;
  readonly inventoryId: string;
  readonly name: string;
  readonly variant: string | null;
  readonly isArchived: boolean;
}

interface StoredSale {
  readonly id: string;
  readonly inventoryId: string;
  readonly status: 'CONFIRMED' | 'VOIDED';
  readonly effectiveAt: number;
}

interface StoredSaleItem {
  readonly saleId: string;
  readonly productId: string;
  readonly quantity: number;
}

interface RecordedQuery {
  readonly sql: string;
  readonly params: readonly unknown[];
  readonly method: string;
}

function createFixture({
  products = [],
  sales = [],
  saleItems = [],
}: {
  readonly products?: readonly StoredProduct[];
  readonly sales?: readonly StoredSale[];
  readonly saleItems?: readonly StoredSaleItem[];
} = {}) {
  const queries: RecordedQuery[] = [];
  const database = drizzle(async (sql, params, method) => {
    queries.push({ sql, params, method });
    const [inventoryId, status, fromInclusive, toExclusive, isArchived] =
      params;
    const matchingSales = sales.filter(
      (sale) =>
        sale.inventoryId === inventoryId &&
        sale.status === status &&
        sale.effectiveAt >= Number(fromInclusive) &&
        sale.effectiveAt < Number(toExclusive),
    );
    const matchingSaleIds = new Set(matchingSales.map(({ id }) => id));
    const ranked = products
      .filter(
        (product) =>
          product.inventoryId === inventoryId &&
          Number(product.isArchived) === Number(isArchived),
      )
      .map((product) => {
        const items = saleItems.filter(
          (item) =>
            item.productId === product.id && matchingSaleIds.has(item.saleId),
        );
        const saleTimes = items.map(
          (item) =>
            matchingSales.find(({ id }) => id === item.saleId)!.effectiveAt,
        );
        return {
          product,
          unitsSold: items.reduce((sum, item) => sum + item.quantity, 0),
          latestSaleAt: Math.max(...saleTimes),
        };
      })
      .filter(({ unitsSold }) => unitsSold > 0)
      .sort(
        (left, right) =>
          right.unitsSold - left.unitsSold ||
          right.latestSaleAt - left.latestSaleAt ||
          right.product.id.localeCompare(left.product.id),
      );

    return {
      rows: ranked
        .slice(0, 1)
        .map(({ product, unitsSold }) => [
          product.id,
          product.name,
          product.variant,
          unitsSold,
        ]),
    };
  });

  return {
    queries,
    reader: createSqliteTopSellingProductReader(
      database as unknown as Parameters<
        typeof createSqliteTopSellingProductReader
      >[0],
    ),
  };
}

function product(overrides: Partial<StoredProduct> = {}): StoredProduct {
  return {
    id: 'product-a',
    inventoryId: INVENTORY_ID,
    name: 'Agua',
    variant: null,
    isArchived: false,
    ...overrides,
  };
}

function sale(overrides: Partial<StoredSale> = {}): StoredSale {
  return {
    id: 'sale-1',
    inventoryId: INVENTORY_ID,
    status: 'CONFIRMED',
    effectiveAt: 1_500,
    ...overrides,
  };
}

function openMigratedDatabase(): DatabaseSync {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON;');

  for (const fileName of MIGRATION_FILES) {
    const path = fileURLToPath(
      new URL(`../drizzle/${fileName}`, import.meta.url),
    );
    database.exec(
      readFileSync(path, 'utf8').replaceAll('--> statement-breakpoint', ''),
    );
  }

  return database;
}

function createNodeSqliteDrizzle(database: DatabaseSync) {
  return drizzle(async (sql, params, method) => {
    const statement = database.prepare(sql);
    const rows = statement.all(...params).map((row) => Object.values(row));
    return { rows: method === 'get' ? (rows[0] ?? []) : rows };
  });
}

test('returns null without confirmed sales in range', async () => {
  assert.equal(await createFixture().reader.getTopSellingProduct(INPUT), null);
});

test('aggregates units for a simple and a multi-product sale', async () => {
  const fixture = createFixture({
    products: [product(), product({ id: 'product-b', name: 'Cola' })],
    sales: [sale()],
    saleItems: [
      { saleId: 'sale-1', productId: 'product-a', quantity: 2 },
      { saleId: 'sale-1', productId: 'product-b', quantity: 5 },
    ],
  });

  assert.deepEqual(await fixture.reader.getTopSellingProduct(INPUT), {
    productId: 'product-b',
    name: 'Cola',
    variant: null,
    unitsSold: 5,
  });
});

test('aggregates one product across multiple confirmed sales', async () => {
  const fixture = createFixture({
    products: [product(), product({ id: 'product-b', name: 'Cola' })],
    sales: [
      sale({ id: 'sale-1' }),
      sale({ id: 'sale-2' }),
      sale({ id: 'sale-3' }),
    ],
    saleItems: [
      { saleId: 'sale-1', productId: 'product-a', quantity: 2 },
      { saleId: 'sale-2', productId: 'product-a', quantity: 3 },
      { saleId: 'sale-3', productId: 'product-b', quantity: 4 },
    ],
  });

  assert.equal(
    (await fixture.reader.getTopSellingProduct(INPUT))?.productId,
    'product-a',
  );
  assert.equal(
    (await fixture.reader.getTopSellingProduct(INPUT))?.unitsSold,
    5,
  );
});

test('excludes VOIDED, out-of-period and other-inventory sales', async () => {
  const fixture = createFixture({
    products: [product()],
    sales: [
      sale({ id: 'confirmed' }),
      sale({ id: 'voided', status: 'VOIDED' }),
      sale({ id: 'before', effectiveAt: FROM - 1 }),
      sale({ id: 'to', effectiveAt: TO }),
      sale({ id: 'other', inventoryId: 'inventory-other' }),
    ],
    saleItems: [
      { saleId: 'confirmed', productId: 'product-a', quantity: 1 },
      { saleId: 'voided', productId: 'product-a', quantity: 99 },
      { saleId: 'before', productId: 'product-a', quantity: 99 },
      { saleId: 'to', productId: 'product-a', quantity: 99 },
      { saleId: 'other', productId: 'product-a', quantity: 99 },
    ],
  });

  assert.equal(
    (await fixture.reader.getTopSellingProduct(INPUT))?.unitsSold,
    1,
  );
});

test('includes fromInclusive and preserves product variant', async () => {
  const fixture = createFixture({
    products: [product({ variant: '500 ml' })],
    sales: [sale({ effectiveAt: FROM })],
    saleItems: [{ saleId: 'sale-1', productId: 'product-a', quantity: 3 }],
  });

  assert.equal(
    (await fixture.reader.getTopSellingProduct(INPUT))?.variant,
    '500 ml',
  );
});

test('excludes archived products from the operational Home ranking', async () => {
  const fixture = createFixture({
    products: [
      product({ isArchived: true }),
      product({ id: 'product-b', name: 'Active' }),
    ],
    sales: [sale()],
    saleItems: [
      { saleId: 'sale-1', productId: 'product-a', quantity: 10 },
      { saleId: 'sale-1', productId: 'product-b', quantity: 2 },
    ],
  });

  assert.equal(
    (await fixture.reader.getTopSellingProduct(INPUT))?.productId,
    'product-b',
  );
});

test('breaks unit ties by latest confirmed sale then product ID descending', async () => {
  const fixture = createFixture({
    products: [
      product({ id: 'product-a' }),
      product({ id: 'product-b' }),
      product({ id: 'product-c' }),
    ],
    sales: [
      sale({ id: 'older', effectiveAt: 1_400 }),
      sale({ id: 'latest', effectiveAt: 1_600 }),
    ],
    saleItems: [
      { saleId: 'older', productId: 'product-a', quantity: 5 },
      { saleId: 'latest', productId: 'product-b', quantity: 5 },
      { saleId: 'latest', productId: 'product-c', quantity: 5 },
    ],
  });

  assert.equal(
    (await fixture.reader.getTopSellingProduct(INPUT))?.productId,
    'product-c',
  );
});

test('uses one aggregate query with explicit scope, grouping and ordering', async () => {
  const fixture = createFixture();

  await fixture.reader.getTopSellingProduct(INPUT);

  assert.equal(fixture.queries.length, 1);
  const query = fixture.queries[0]!;
  assert.equal(query.method, 'all');
  assert.match(query.sql, /sum\(/i);
  assert.match(query.sql, /max\(/i);
  assert.match(query.sql, /inner join "sales"/i);
  assert.match(query.sql, /inner join "products"/i);
  assert.match(query.sql, /group by/i);
  assert.match(query.sql, /order by/i);
  assert.match(query.sql, /limit \?/i);
  assert.ok(!query.sql.includes('inventory_movements'));
  assert.deepEqual(query.params, [INVENTORY_ID, 'CONFIRMED', FROM, TO, 0, 1]);
});

test('executes tie-breakers and recalculates after void against real migrated SQLite', async () => {
  const database = openMigratedDatabase();

  try {
    database
      .prepare(
        'INSERT INTO inventories (id, name, currency, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(INVENTORY_ID, 'Principal', 'USD', FROM, FROM);
    const insertProduct = database.prepare(
      `INSERT INTO products (
        id, inventory_id, name, variant, regular_sale_price_units,
        is_archived, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 1000000, ?, ?, ?)`,
    );
    insertProduct.run('product-a', INVENTORY_ID, 'Agua', null, 0, FROM, FROM);
    insertProduct.run(
      'product-b',
      INVENTORY_ID,
      'Cola',
      '500 ml',
      0,
      FROM,
      FROM,
    );
    insertProduct.run(
      'product-z',
      INVENTORY_ID,
      'Archivado',
      null,
      1,
      FROM,
      FROM,
    );
    const insertSale = database.prepare(
      `INSERT INTO sales (
        id, inventory_id, effective_at, created_at, updated_at, status,
        total_amount_units, estimated_cost_units, estimated_profit_units
      ) VALUES (?, ?, ?, ?, ?, ?, 1000000, NULL, NULL)`,
    );
    insertSale.run('sale-old', INVENTORY_ID, 1_400, 1_400, 1_400, 'CONFIRMED');
    insertSale.run('sale-new', INVENTORY_ID, 1_600, 1_600, 1_600, 'CONFIRMED');
    insertSale.run('sale-void', INVENTORY_ID, 1_700, 1_700, 1_700, 'VOIDED');
    const insertItem = database.prepare(
      `INSERT INTO sale_items (
        id, sale_id, product_id, quantity, unit_sale_price_units,
        subtotal_units, cost_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 1000000, ?, 'UNKNOWN', ?, ?)`,
    );
    insertItem.run(
      'item-a',
      'sale-old',
      'product-a',
      5,
      5_000_000,
      1_400,
      1_400,
    );
    insertItem.run(
      'item-b',
      'sale-new',
      'product-b',
      5,
      5_000_000,
      1_600,
      1_600,
    );
    insertItem.run(
      'item-z',
      'sale-new',
      'product-z',
      50,
      50_000_000,
      1_600,
      1_600,
    );
    insertItem.run(
      'item-void',
      'sale-void',
      'product-a',
      99,
      99_000_000,
      1_700,
      1_700,
    );

    const reader = createSqliteTopSellingProductReader(
      createNodeSqliteDrizzle(database) as unknown as Parameters<
        typeof createSqliteTopSellingProductReader
      >[0],
    );

    assert.deepEqual(await reader.getTopSellingProduct(INPUT), {
      productId: 'product-b',
      name: 'Cola',
      variant: '500 ml',
      unitsSold: 5,
    });

    database
      .prepare(
        "UPDATE sales SET status = 'VOIDED', updated_at = ? WHERE id = 'sale-new'",
      )
      .run(1_700);

    assert.deepEqual(await reader.getTopSellingProduct(INPUT), {
      productId: 'product-a',
      name: 'Agua',
      variant: null,
      unitsSold: 5,
    });
  } finally {
    database.close();
  }
});

test('fails explicitly when aggregated units are unsafe', async () => {
  const database = drizzle(async () => ({
    rows: [['product-a', 'Agua', null, Number.MAX_SAFE_INTEGER + 1]],
  }));
  const reader = createSqliteTopSellingProductReader(
    database as unknown as Parameters<
      typeof createSqliteTopSellingProductReader
    >[0],
  );

  await assert.rejects(
    () => reader.getTopSellingProduct(INPUT),
    /safe integer/,
  );
});
