import assert from 'node:assert/strict';
import test from 'node:test';

import { drizzle } from 'drizzle-orm/sqlite-proxy';

import type { HistoryEntry } from '@stock-app/application';

import { createSqliteHistoryReader } from '../src/infrastructure/sqlite/repositories/repositories';

const INVENTORY_ID = 'inventory-1';

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
  readonly totalAmountUnits: number;
  readonly status: 'CONFIRMED' | 'VOIDED';
  readonly effectiveAt: number;
  readonly createdAt: number;
}

interface StoredSaleItem {
  readonly saleId: string;
  readonly quantity: number;
}

interface StoredPurchase {
  readonly id: string;
  readonly inventoryId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly unitCostUnits: number;
  readonly totalAmountUnits: number;
  readonly status: 'CONFIRMED' | 'VOIDED';
  readonly effectiveAt: number;
  readonly createdAt: number;
}

interface StoredAdjustment {
  readonly id: string;
  readonly inventoryId: string;
  readonly productId: string;
  readonly difference: number;
  readonly reason:
    'COUNT_CORRECTION' | 'DAMAGED' | 'LOST' | 'INTERNAL_USE' | 'OTHER';
  readonly effectiveAt: number;
  readonly createdAt: number;
}

interface FixtureInput {
  readonly products?: readonly StoredProduct[];
  readonly sales?: readonly StoredSale[];
  readonly saleItems?: readonly StoredSaleItem[];
  readonly purchases?: readonly StoredPurchase[];
  readonly adjustments?: readonly StoredAdjustment[];
}

interface RecordedQuery {
  readonly sql: string;
  readonly params: readonly unknown[];
  readonly method: string;
}

function compareRowsNewestFirst(
  left: {
    readonly id: string;
    readonly effectiveAt: number;
    readonly createdAt: number;
  },
  right: {
    readonly id: string;
    readonly effectiveAt: number;
    readonly createdAt: number;
  },
): number {
  if (left.effectiveAt !== right.effectiveAt) {
    return left.effectiveAt < right.effectiveAt ? 1 : -1;
  }

  if (left.createdAt !== right.createdAt) {
    return left.createdAt < right.createdAt ? 1 : -1;
  }

  if (left.id === right.id) return 0;
  return left.id < right.id ? 1 : -1;
}

function createFixture({
  products = [],
  sales = [],
  saleItems = [],
  purchases = [],
  adjustments = [],
}: FixtureInput = {}) {
  const queries: RecordedQuery[] = [];
  const database = drizzle(async (sql, params, method) => {
    queries.push({ sql, params, method });
    const inventoryId = String(params[0]);
    const limit = Number(params.at(-1));

    if (sql.includes('from "sales"')) {
      return {
        rows: sales
          .filter((sale) => sale.inventoryId === inventoryId)
          .slice()
          .sort(compareRowsNewestFirst)
          .slice(0, limit)
          .map((sale) => [
            sale.id,
            sale.totalAmountUnits,
            sale.status,
            sale.effectiveAt,
            sale.createdAt,
            saleItems
              .filter(({ saleId }) => saleId === sale.id)
              .reduce((total, item) => total + item.quantity, 0),
          ]),
      };
    }

    if (sql.includes('from "purchases"')) {
      return {
        rows: purchases
          .filter((purchase) => purchase.inventoryId === inventoryId)
          .flatMap((purchase) => {
            const product = products.find(
              (candidate) =>
                candidate.id === purchase.productId &&
                candidate.inventoryId === purchase.inventoryId,
            );

            return product === undefined ? [] : [{ purchase, product }];
          })
          .sort((left, right) =>
            compareRowsNewestFirst(left.purchase, right.purchase),
          )
          .slice(0, limit)
          .map(({ purchase, product }) => [
            purchase.id,
            purchase.productId,
            product.name,
            product.variant,
            purchase.quantity,
            purchase.unitCostUnits,
            purchase.totalAmountUnits,
            purchase.status,
            purchase.effectiveAt,
            purchase.createdAt,
          ]),
      };
    }

    if (sql.includes('from "stock_adjustments"')) {
      return {
        rows: adjustments
          .filter((adjustment) => adjustment.inventoryId === inventoryId)
          .flatMap((adjustment) => {
            const product = products.find(
              (candidate) =>
                candidate.id === adjustment.productId &&
                candidate.inventoryId === adjustment.inventoryId,
            );

            return product === undefined ? [] : [{ adjustment, product }];
          })
          .sort((left, right) =>
            compareRowsNewestFirst(left.adjustment, right.adjustment),
          )
          .slice(0, limit)
          .map(({ adjustment, product }) => [
            adjustment.id,
            adjustment.productId,
            product.name,
            product.variant,
            adjustment.difference,
            adjustment.reason,
            adjustment.effectiveAt,
            adjustment.createdAt,
          ]),
      };
    }

    throw new Error(`Unexpected history SQL: ${sql}`);
  });

  return {
    queries,
    reader: createSqliteHistoryReader(
      database as unknown as Parameters<typeof createSqliteHistoryReader>[0],
    ),
  };
}

function product(overrides: Partial<StoredProduct> = {}): StoredProduct {
  return {
    id: 'product-1',
    inventoryId: INVENTORY_ID,
    name: 'Coca-Cola',
    variant: '500 ml',
    isArchived: false,
    ...overrides,
  };
}

function sale(overrides: Partial<StoredSale> = {}): StoredSale {
  return {
    id: 'sale-1',
    inventoryId: INVENTORY_ID,
    totalAmountUnits: 12_500_000,
    status: 'CONFIRMED',
    effectiveAt: 10_000,
    createdAt: 10_001,
    ...overrides,
  };
}

function purchase(overrides: Partial<StoredPurchase> = {}): StoredPurchase {
  return {
    id: 'purchase-1',
    inventoryId: INVENTORY_ID,
    productId: 'product-1',
    quantity: 10,
    unitCostUnits: 1_200_000,
    totalAmountUnits: 12_000_000,
    status: 'CONFIRMED',
    effectiveAt: 10_000,
    createdAt: 10_001,
    ...overrides,
  };
}

function adjustment(
  overrides: Partial<StoredAdjustment> = {},
): StoredAdjustment {
  return {
    id: 'adjustment-1',
    inventoryId: INVENTORY_ID,
    productId: 'product-1',
    difference: -2,
    reason: 'DAMAGED',
    effectiveAt: 10_000,
    createdAt: 10_001,
    ...overrides,
  };
}

async function list(
  fixture: ReturnType<typeof createFixture>,
  limit = 50,
): Promise<readonly HistoryEntry[]> {
  return fixture.reader.listRecent({ inventoryId: INVENTORY_ID, limit });
}

test('maps one multi-item Sale to one entry with exact total and aggregated units', async () => {
  const fixture = createFixture({
    sales: [sale()],
    saleItems: [
      { saleId: 'sale-1', quantity: 2 },
      { saleId: 'sale-1', quantity: 3 },
    ],
  });

  const result = await list(fixture);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.type, 'SALE');
  if (result[0]?.type !== 'SALE') assert.fail('Expected Sale entry.');
  assert.equal(result[0].units, 5);
  assert.equal(result[0].totalAmount.scaledUnits, 12_500_000);
  assert.equal(result[0].status, 'CONFIRMED');
});

test('includes CONFIRMED and VOIDED Sales while excluding another Inventory', async () => {
  const fixture = createFixture({
    sales: [
      sale({ id: 'confirmed' }),
      sale({ id: 'voided', status: 'VOIDED' }),
      sale({ id: 'other', inventoryId: 'inventory-other' }),
    ],
    saleItems: [
      { saleId: 'confirmed', quantity: 1 },
      { saleId: 'voided', quantity: 2 },
      { saleId: 'other', quantity: 9 },
    ],
  });

  const result = await list(fixture);

  assert.deepEqual(
    result.map(({ id }) => id),
    ['voided', 'confirmed'],
  );
  assert.equal(result[0]?.type === 'SALE' && result[0].status, 'VOIDED');
});

test('maps Purchase product, quantity and exact Money snapshots', async () => {
  const fixture = createFixture({
    products: [product()],
    purchases: [purchase()],
  });

  const result = await list(fixture);

  assert.equal(result[0]?.type, 'PURCHASE');
  if (result[0]?.type !== 'PURCHASE') assert.fail('Expected Purchase entry.');
  assert.equal(result[0].productName, 'Coca-Cola');
  assert.equal(result[0].productVariant, '500 ml');
  assert.equal(result[0].quantity, 10);
  assert.equal(result[0].unitCost.scaledUnits, 1_200_000);
  assert.equal(result[0].totalAmount.scaledUnits, 12_000_000);
  assert.equal(result[0].status, 'CONFIRMED');
});

test('includes VOIDED Purchase for an archived Product and excludes another Inventory', async () => {
  const fixture = createFixture({
    products: [product({ isArchived: true })],
    purchases: [
      purchase({ id: 'voided', status: 'VOIDED' }),
      purchase({ id: 'other', inventoryId: 'inventory-other' }),
    ],
  });

  const result = await list(fixture);

  assert.deepEqual(
    result.map(({ id }) => id),
    ['voided'],
  );
  assert.equal(result[0]?.type === 'PURCHASE' && result[0].status, 'VOIDED');
});

test('maps positive and negative StockAdjustments with product and reason', async () => {
  const fixture = createFixture({
    products: [product({ isArchived: true })],
    adjustments: [
      adjustment({ id: 'negative', difference: -3, reason: 'LOST' }),
      adjustment({
        id: 'positive',
        difference: 5,
        reason: 'COUNT_CORRECTION',
        effectiveAt: 10_100,
      }),
      adjustment({ id: 'other', inventoryId: 'inventory-other' }),
    ],
  });

  const result = await list(fixture);

  assert.deepEqual(
    result.map(({ id }) => id),
    ['positive', 'negative'],
  );
  assert.deepEqual(
    result.map((entry) =>
      entry.type === 'ADJUSTMENT'
        ? [entry.difference, entry.reason, entry.productName]
        : null,
    ),
    [
      [5, 'COUNT_CORRECTION', 'Coca-Cola'],
      [-3, 'LOST', 'Coca-Cola'],
    ],
  );
});

test('merges operation types into one global chronology', async () => {
  const fixture = createFixture({
    products: [product()],
    sales: [
      sale({ id: 'sale-1000', effectiveAt: 10_000 }),
      sale({ id: 'sale-1015', effectiveAt: 10_150 }),
    ],
    saleItems: [
      { saleId: 'sale-1000', quantity: 1 },
      { saleId: 'sale-1015', quantity: 1 },
    ],
    purchases: [purchase({ id: 'purchase-1005', effectiveAt: 10_050 })],
    adjustments: [adjustment({ id: 'adjustment-1010', effectiveAt: 10_100 })],
  });

  const result = await list(fixture);

  assert.deepEqual(
    result.map(({ id }) => id),
    ['sale-1015', 'adjustment-1010', 'purchase-1005', 'sale-1000'],
  );
});

test('uses createdAt then raw ID as global deterministic tie-breakers', async () => {
  const fixture = createFixture({
    products: [product()],
    sales: [sale({ id: 'operation-a', createdAt: 20_000 })],
    saleItems: [{ saleId: 'operation-a', quantity: 1 }],
    purchases: [purchase({ id: 'operation-z', createdAt: 20_000 })],
    adjustments: [adjustment({ id: 'created-later', createdAt: 20_001 })],
  });

  const result = await list(fixture);

  assert.deepEqual(
    result.map(({ id }) => id),
    ['created-later', 'operation-z', 'operation-a'],
  );
});

test('takes the requested top N from each source then the top N globally', async () => {
  const products = [product()];
  const sales = Array.from({ length: 20 }, (_, index) =>
    sale({ id: `sale-${index}`, effectiveAt: 1_000 + index }),
  );
  const fixture = createFixture({
    products,
    sales,
    saleItems: sales.map(({ id }) => ({ saleId: id, quantity: 1 })),
    purchases: Array.from({ length: 20 }, (_, index) =>
      purchase({ id: `purchase-${index}`, effectiveAt: 2_000 + index }),
    ),
    adjustments: Array.from({ length: 20 }, (_, index) =>
      adjustment({ id: `adjustment-${index}`, effectiveAt: 3_000 + index }),
    ),
  });

  const result = await list(fixture, 50);

  assert.equal(result.length, 50);
  assert.equal(result[0]?.id, 'adjustment-19');
  assert.equal(result.at(-1)?.id, 'sale-10');
});

test('applies ordering and limit in every source query without archived filtering', async () => {
  const fixture = createFixture({ products: [product({ isArchived: true })] });

  await list(fixture, 3);

  assert.equal(fixture.queries.length, 3);
  assert.ok(fixture.queries.every(({ method }) => method === 'all'));
  assert.ok(
    fixture.queries.every(
      ({ sql }) => sql.includes('order by') && sql.includes('limit ?'),
    ),
  );
  assert.ok(fixture.queries.every(({ params }) => params.at(-1) === 3));
  assert.ok(fixture.queries.every(({ sql }) => !sql.includes('is_archived')));
  assert.ok(
    fixture.queries.every(({ sql }) => !sql.includes('inventory_movements')),
  );
});

test('fails explicitly for unsafe Money, unit aggregates and timestamps', async () => {
  const unsafeMoney = createFixture({
    sales: [sale({ totalAmountUnits: Number.MAX_SAFE_INTEGER + 1 })],
    saleItems: [{ saleId: 'sale-1', quantity: 1 }],
  });
  const unsafeUnits = createFixture({
    sales: [sale()],
    saleItems: [
      { saleId: 'sale-1', quantity: Number.MAX_SAFE_INTEGER },
      { saleId: 'sale-1', quantity: Number.MAX_SAFE_INTEGER },
    ],
  });
  const invalidTimestamp = createFixture({
    products: [product()],
    purchases: [purchase({ effectiveAt: -1 })],
  });

  await assert.rejects(() => list(unsafeMoney), /safe integer/);
  await assert.rejects(() => list(unsafeUnits), /safe integer/);
  await assert.rejects(() => list(invalidTimestamp), /non-negative/);
});
