import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFixture } from './helpers.js';
import { readDashboard } from '../../src/read-models/dashboard.js';
import { readHistory } from '../../src/read-models/history.js';
import { reportingDay } from '../../src/read-models/time.js';
import { id } from '../postgres/helpers.js';
import type { HistoryEntryDto } from '@stock-app/contracts';

test('history includes all three commercial types, VOIDED snapshots, archived names, strict order and scoped keyset', async (t) => {
  const f = await readFixture(t),
    purchase = await f.purchase(),
    sale = await f.sold(),
    adjustment = await f.adjust(sale.payload.items[0].productId, 19, 2000);
  const voidPurchase = await f.command(purchase.payload.purchaseId);
  await f.run(voidPurchase);
  await f.pool.query(
    "UPDATE products SET is_archived=true,name='Current archived name'",
  );
  const before = await f.counts(f.context),
    seen: HistoryEntryDto[] = [];
  let cursor: string | undefined;
  do {
    const page = await f.read((db) =>
      readHistory(db, f.scope('history'), 1, cursor, f.codec),
    );
    seen.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  assert.deepEqual(
    seen.map((v) => [v.type, v.id]),
    [
      ['ADJUSTMENT', adjustment.payload.stockAdjustmentId],
      ['SALE', sale.payload.saleId],
      ['PURCHASE', purchase.payload.purchaseId],
    ],
  );
  assert.equal(seen[2].type, 'PURCHASE');
  if (seen[2].type === 'PURCHASE') {
    assert.equal(seen[2].status, 'VOIDED');
    assert.equal(seen[2].productName, 'Current archived name');
  }
  assert.ok(!seen.some((v) => String(v.type) === 'REVERSAL'));
  assert.deepEqual(await f.counts(f.context), before);
  const first = await readHistory(
    f.db,
    f.scope('history'),
    1,
    undefined,
    f.codec,
  );
  assert.ok(first.nextCursor);
  const other = await f.dataset();
  await assert.rejects(
    () =>
      readHistory(
        f.db,
        f.scope('history', '', other.inventory.id),
        1,
        first.nextCursor!,
        f.codec,
      ),
    { statusCode: 400 },
  );
});
test('history identical effective/created/id keys across tables use internal type tie-breaker without duplicates', async (t) => {
  const f = await readFixture(t),
    purchase = await f.purchase(),
    sale = await f.sold(),
    adjustment = await f.adjust(sale.payload.items[0].productId, 19),
    shared = id();
  await f.pool.query(
    'UPDATE inventory_movements SET source_id=$1 WHERE source_id=$2',
    [shared, purchase.payload.purchaseId],
  );
  await f.pool.query(
    'UPDATE purchases SET id=$1,effective_at=2000,created_at=2100,updated_at=2100',
    [shared],
  );
  await f.pool.query(
    'UPDATE inventory_movements SET source_id=$1 WHERE source_id=$2',
    [shared, adjustment.payload.stockAdjustmentId],
  );
  await f.pool.query(
    'UPDATE stock_adjustments SET id=$1,effective_at=2000,created_at=2100,updated_at=2100',
    [shared],
  );
  const a = await readHistory(f.db, f.scope('history'), 1, undefined, f.codec),
    b = await readHistory(f.db, f.scope('history'), 1, a.nextCursor!, f.codec),
    c = await readHistory(f.db, f.scope('history'), 1, b.nextCursor!, f.codec);
  assert.equal(a.items[0].type, 'PURCHASE');
  assert.equal(b.items[0].type, 'ADJUSTMENT');
  assert.equal(c.items[0].type, 'SALE');
  assert.equal(c.items[0].id, sale.payload.saleId);
  assert.equal(c.nextCursor, null);
});
for (const zone of [
  'UTC',
  'Pacific/Kiritimati',
  'America/Los_Angeles',
  'America/New_York',
])
  test(`dashboard ${zone} uses stored business day, half-open boundaries and confirmed-only complete totals`, async (t) => {
    const f = await readFixture(t),
      now = Date.parse('2026-03-08T12:00:00Z'),
      range = reportingDay(now, zone);
    await f.pool.query('UPDATE inventories SET reporting_time_zone=$1', [zone]);
    const included = await f.sold('10000000', f.context, range.fromInclusive),
      excluded = await f.sold('10000000', f.context, range.toExclusive),
      voided = await f.sold('10000000', f.context, range.fromInclusive + 1000);
    await f.voidSale(voided);
    const before = await f.counts(f.context),
      result = await f.read((db) =>
        readDashboard(db, f.context.inventory.id, zone, now, f.codec),
      );
    assert.equal(result.fromInclusive, range.fromInclusive);
    assert.equal(result.toExclusive, range.toExclusive);
    assert.deepEqual(result.sales, {
      totalAmount: '30000000',
      estimatedProfit: '10000000',
      unitsSold: 2,
    });
    assert.equal(
      result.topSelling?.productId,
      included.payload.items[0].productId,
    );
    assert.notEqual(
      result.topSelling?.productId,
      excluded.payload.items[0].productId,
    );
    assert.ok(
      result.recent.some((v) => v.type === 'SALE' && v.status === 'VOIDED'),
    );
    assert.deepEqual(await f.counts(f.context), before);
  });
test('dashboard zero-sales is exact zero profit; any unknown profit makes the aggregate unavailable', async (t) => {
  const f = await readFixture(t),
    now = Date.parse('2026-05-01T12:00:00Z'),
    day = reportingDay(now, 'UTC');
  assert.deepEqual(
    (await readDashboard(f.db, f.context.inventory.id, 'UTC', now, f.codec))
      .sales,
    { totalAmount: '0', estimatedProfit: '0', unitsSold: 0 },
  );
  await f.sold('10000000', f.context, day.fromInclusive + 1000);
  await f.sold(null, f.context, day.fromInclusive + 2000);
  assert.deepEqual(
    (
      await f.read((db) =>
        readDashboard(db, f.context.inventory.id, 'UTC', now, f.codec),
      )
    ).sales,
    { totalAmount: '60000000', estimatedProfit: null, unitsSold: 4 },
  );
});
test('dashboard top seller ties latest confirmed sale then Product.id DESC; archive removes promotion only', async (t) => {
  const f = await readFixture(t),
    now = Date.parse('2026-05-01T12:00:00Z'),
    day = reportingDay(now, 'UTC'),
    a = await f.sold('10000000', f.context, day.fromInclusive + 1000),
    b = await f.sold('10000000', f.context, day.fromInclusive + 2000);
  let result = await readDashboard(
    f.db,
    f.context.inventory.id,
    'UTC',
    now,
    f.codec,
  );
  assert.equal(result.topSelling?.productId, b.payload.items[0].productId);
  await f.pool.query('UPDATE sales SET effective_at=$1', [
    day.fromInclusive + 1000,
  ]);
  result = await readDashboard(
    f.db,
    f.context.inventory.id,
    'UTC',
    now,
    f.codec,
  );
  const top = [a.payload.items[0].productId, b.payload.items[0].productId]
    .sort()
    .at(-1)!;
  assert.equal(result.topSelling?.productId, top);
  await f.pool.query('UPDATE products SET is_archived=true WHERE id=$1', [top]);
  result = await readDashboard(
    f.db,
    f.context.inventory.id,
    'UTC',
    now,
    f.codec,
  );
  assert.notEqual(result.topSelling?.productId, top);
  assert.equal(result.sales.unitsSold, 4);
});
test('dashboard low-stock preview2 and recent5 follow existing UX; no foreign values or REVERSAL rows', async (t) => {
  const f = await readFixture(t),
    now = Date.parse('2026-05-01T12:00:00Z');
  for (let i = 0; i < 6; i++) {
    const p = await f.product(0, null);
    await f.pool.query('UPDATE products SET minimum_stock=0 WHERE id=$1', [p]);
    await f.sold('10000000', f.context, 1000 + i * 1000);
  }
  const other = await f.dataset();
  await f.sold('10000000', other, Date.parse('2026-05-01T01:00:00Z'));
  const result = await f.read((db) =>
    readDashboard(db, f.context.inventory.id, 'UTC', now, f.codec),
  );
  assert.equal(result.lowStock.length, 2);
  assert.equal(result.recent.length, 5);
  assert.ok(
    result.lowStock.every(
      (v) => v.isLowStock && v.product.inventoryId === f.context.inventory.id,
    ),
  );
  assert.deepEqual(result.sales, {
    totalAmount: '0',
    estimatedProfit: '0',
    unitsSold: 0,
  });
  assert.equal(result.topSelling, null);
});
