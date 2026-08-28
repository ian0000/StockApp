import assert from 'node:assert/strict';
import test from 'node:test';

import { drizzle } from 'drizzle-orm/sqlite-proxy';

import { createSqlitePurchaseDetailsReader } from '../src/infrastructure/sqlite/repositories/repositories';

const INVENTORY_ID = 'inventory-1';
const PURCHASE_ID = 'purchase-1';

interface StoredPurchase {
  readonly id: string;
  readonly inventoryId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly unitCostUnits: number;
  readonly totalAmountUnits: number;
  readonly effectiveAt: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly status: 'CONFIRMED' | 'VOIDED';
  readonly notes: string | null;
  readonly averageCostBeforeUnits: number | null;
  readonly averageCostAfterUnits: number;
  readonly stockBefore: number;
  readonly stockAfter: number;
  readonly productName: string | null;
  readonly productVariant: string | null;
  readonly isArchived?: boolean;
}

interface RecordedQuery {
  readonly sql: string;
  readonly params: readonly unknown[];
}

function storedPurchase(
  overrides: Partial<StoredPurchase> = {},
): StoredPurchase {
  return {
    id: PURCHASE_ID,
    inventoryId: INVENTORY_ID,
    productId: 'product-1',
    quantity: 12,
    unitCostUnits: 850_000,
    totalAmountUnits: 10_200_000,
    effectiveAt: 10_000,
    createdAt: 10_001,
    updatedAt: 10_001,
    status: 'CONFIRMED',
    notes: 'Entrega de la mañana',
    averageCostBeforeUnits: 1_000_000,
    averageCostAfterUnits: 918_182,
    stockBefore: 10,
    stockAfter: 22,
    productName: 'Coca-Cola',
    productVariant: '500 ml',
    ...overrides,
  };
}

function createFixture(
  purchases: readonly StoredPurchase[] = [storedPurchase()],
) {
  const queries: RecordedQuery[] = [];
  const database = drizzle(async (sql, params) => {
    queries.push({ sql, params });

    if (!sql.includes('from "purchases"')) {
      throw new Error(`Unexpected Purchase details SQL: ${sql}`);
    }

    const matching = purchases.find(
      (purchase) =>
        params.includes(purchase.inventoryId) && params.includes(purchase.id),
    );

    return {
      rows:
        matching === undefined
          ? []
          : [
              [
                matching.id,
                matching.inventoryId,
                matching.productId,
                matching.quantity,
                matching.unitCostUnits,
                matching.totalAmountUnits,
                matching.effectiveAt,
                matching.createdAt,
                matching.updatedAt,
                matching.status,
                matching.notes,
                matching.averageCostBeforeUnits,
                matching.averageCostAfterUnits,
                matching.stockBefore,
                matching.stockAfter,
                matching.productName,
                matching.productVariant,
              ],
            ],
    };
  });

  return {
    queries,
    reader: createSqlitePurchaseDetailsReader(
      database as unknown as Parameters<
        typeof createSqlitePurchaseDetailsReader
      >[0],
    ),
  };
}

test('reads one scoped Purchase and reconstructs every historical snapshot', async () => {
  const fixture = createFixture();

  const source = await fixture.reader.findById({
    inventoryId: INVENTORY_ID,
    purchaseId: PURCHASE_ID,
  });

  assert.equal(source?.purchase.id, PURCHASE_ID);
  assert.equal(source?.purchase.productId, 'product-1');
  assert.equal(source?.purchase.quantity, 12);
  assert.equal(source?.purchase.unitCost.scaledUnits, 850_000);
  assert.equal(source?.purchase.totalAmount.scaledUnits, 10_200_000);
  assert.equal(source?.purchase.effectiveAt, 10_000);
  assert.equal(source?.purchase.status, 'CONFIRMED');
  assert.equal(source?.purchase.averageCostBefore?.scaledUnits, 1_000_000);
  assert.equal(source?.purchase.averageCostAfter.scaledUnits, 918_182);
  assert.equal(source?.purchase.stockBefore, 10);
  assert.equal(source?.purchase.stockAfter, 22);
  assert.equal(source?.productName, 'Coca-Cola');
  assert.equal(source?.productVariant, '500 ml');
  assert.equal(fixture.queries.length, 1);
});

test('returns null for a missing or other-inventory Purchase', async () => {
  const fixture = createFixture();

  assert.equal(
    await fixture.reader.findById({
      inventoryId: 'inventory-2',
      purchaseId: PURCHASE_ID,
    }),
    null,
  );
  assert.equal(fixture.queries.length, 1);
});

test('uses one composite Product LEFT JOIN without current inventory or price data', async () => {
  const fixture = createFixture([
    storedPurchase({ isArchived: true, productName: 'Producto archivado' }),
  ]);

  const source = await fixture.reader.findById({
    inventoryId: INVENTORY_ID,
    purchaseId: PURCHASE_ID,
  });
  const query = fixture.queries[0]?.sql ?? '';

  assert.equal(source?.productName, 'Producto archivado');
  assert.match(query, /left join "products"/i);
  assert.match(query, /"products"\."inventory_id"/i);
  assert.match(query, /"products"\."id"/i);
  assert.doesNotMatch(query, /is_archived/i);
  assert.doesNotMatch(query, /regular_sale_price_units/i);
  assert.doesNotMatch(query, /inventory_states/i);
  assert.doesNotMatch(query, /inventory_movements/i);
});

test('keeps Purchase readable when the current Product label is missing', async () => {
  const fixture = createFixture([
    storedPurchase({ productName: null, productVariant: null }),
  ]);

  const source = await fixture.reader.findById({
    inventoryId: INVENTORY_ID,
    purchaseId: PURCHASE_ID,
  });

  assert.equal(source?.productName, null);
  assert.equal(source?.productVariant, null);
  assert.equal(source?.purchase.unitCost.scaledUnits, 850_000);
});

test('preserves known zero and exact six-decimal Money without floating point', async () => {
  const zero = createFixture([
    storedPurchase({
      quantity: 4,
      unitCostUnits: 0,
      totalAmountUnits: 0,
      averageCostBeforeUnits: null,
      averageCostAfterUnits: 0,
      stockBefore: 0,
      stockAfter: 4,
    }),
  ]);
  const precise = createFixture([
    storedPurchase({
      quantity: 3,
      unitCostUnits: 123_456,
      totalAmountUnits: 370_368,
      averageCostBeforeUnits: null,
      averageCostAfterUnits: 123_456,
      stockBefore: 0,
      stockAfter: 3,
    }),
  ]);

  const zeroSource = await zero.reader.findById({
    inventoryId: INVENTORY_ID,
    purchaseId: PURCHASE_ID,
  });
  const preciseSource = await precise.reader.findById({
    inventoryId: INVENTORY_ID,
    purchaseId: PURCHASE_ID,
  });

  assert.equal(zeroSource?.purchase.unitCost.scaledUnits, 0);
  assert.equal(zeroSource?.purchase.totalAmount.scaledUnits, 0);
  assert.equal(preciseSource?.purchase.unitCost.scaledUnits, 123_456);
  assert.equal(preciseSource?.purchase.totalAmount.scaledUnits, 370_368);
});

test('preserves negative stock and nullable previous average cost', async () => {
  const fixture = createFixture([
    storedPurchase({
      quantity: 2,
      unitCostUnits: 850_000,
      totalAmountUnits: 1_700_000,
      averageCostBeforeUnits: null,
      averageCostAfterUnits: 850_000,
      stockBefore: -5,
      stockAfter: -3,
    }),
  ]);

  const source = await fixture.reader.findById({
    inventoryId: INVENTORY_ID,
    purchaseId: PURCHASE_ID,
  });

  assert.equal(source?.purchase.stockBefore, -5);
  assert.equal(source?.purchase.stockAfter, -3);
  assert.equal(source?.purchase.averageCostBefore, null);
  assert.equal(source?.purchase.averageCostAfter.scaledUnits, 850_000);
});

test('fails explicitly for unsafe Money, timestamps and quantities', async (context) => {
  await context.test('unsafe scaled units', async () => {
    const fixture = createFixture([
      storedPurchase({ unitCostUnits: Number.MAX_SAFE_INTEGER + 1 }),
    ]);
    await assert.rejects(
      fixture.reader.findById({
        inventoryId: INVENTORY_ID,
        purchaseId: PURCHASE_ID,
      }),
      /scaled units must be a safe integer/i,
    );
  });

  await context.test('invalid timestamp', async () => {
    const fixture = createFixture([storedPurchase({ effectiveAt: -1 })]);
    await assert.rejects(
      fixture.reader.findById({
        inventoryId: INVENTORY_ID,
        purchaseId: PURCHASE_ID,
      }),
      /effective at/i,
    );
  });

  await context.test('unsafe quantity', async () => {
    const fixture = createFixture([
      storedPurchase({ quantity: Number.MAX_SAFE_INTEGER + 1 }),
    ]);
    await assert.rejects(
      fixture.reader.findById({
        inventoryId: INVENTORY_ID,
        purchaseId: PURCHASE_ID,
      }),
      /quantity must be a safe integer/i,
    );
  });
});
