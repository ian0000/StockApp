import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { decodeMoney, type DashboardDto } from '@stock-app/contracts';
import {
  sales,
  saleItems,
  products,
} from '../infrastructure/postgres/schema.js';
import { reportingDay } from './time.js';
import { readProductPage, type ReadDatabase } from './products.js';
import { readHistory } from './history.js';
import type { createReadCursor } from './cursor.js';

export async function readDashboard(
  db: ReadDatabase,
  inventoryId: string,
  timeZone: string,
  now: number,
  codec: ReturnType<typeof createReadCursor>,
): Promise<DashboardDto> {
  const range = reportingDay(now, timeZone),
    condition = and(
      eq(sales.inventoryId, inventoryId),
      eq(sales.status, 'CONFIRMED'),
      gte(sales.effectiveAt, BigInt(range.fromInclusive)),
      lt(sales.effectiveAt, BigInt(range.toExclusive)),
    );
  const [aggregate] = await db
    .select({
      count: sql<string>`count(*)::text`,
      known: sql<string>`count(${sales.estimatedProfitUnits})::text`,
      total: sql<string>`coalesce(sum(${sales.totalAmountUnits}),0)::text`,
      profit: sql<string | null>`sum(${sales.estimatedProfitUnits})::text`,
    })
    .from(sales)
    .where(condition);
  const [units] = await db
    .select({
      units: sql<string>`coalesce(sum(${saleItems.quantity}),0)::text`,
      sales: sql<string>`count(distinct ${saleItems.saleId})::text`,
    })
    .from(saleItems)
    .innerJoin(
      sales,
      and(
        eq(sales.inventoryId, saleItems.inventoryId),
        eq(sales.id, saleItems.saleId),
      ),
    )
    .where(and(condition, eq(saleItems.inventoryId, inventoryId)));
  if (!aggregate || !units || aggregate.count !== units.sales)
    throw new Error('Incomplete sales summary.');
  decodeMoney(aggregate.total);
  if (aggregate.count === aggregate.known && aggregate.profit !== null)
    decodeMoney(aggregate.profit);
  const [top] = await db
    .select({
      productId: products.id,
      name: products.name,
      variant: products.variant,
      units: sql<string>`sum(${saleItems.quantity})::text`,
    })
    .from(saleItems)
    .innerJoin(
      sales,
      and(
        eq(sales.inventoryId, saleItems.inventoryId),
        eq(sales.id, saleItems.saleId),
      ),
    )
    .innerJoin(
      products,
      and(
        eq(products.inventoryId, inventoryId),
        eq(products.inventoryId, saleItems.inventoryId),
        eq(products.id, saleItems.productId),
      ),
    )
    .where(
      and(
        condition,
        eq(saleItems.inventoryId, inventoryId),
        eq(products.isArchived, false),
      ),
    )
    .groupBy(products.id, products.name, products.variant)
    .orderBy(
      sql`sum(${saleItems.quantity}) DESC`,
      sql`max(${sales.effectiveAt}) DESC`,
      desc(products.id),
    )
    .limit(1);
  const lowStock = await readProductPage(
      db,
      { inventoryId, route: 'stock-low', search: '' },
      2,
      undefined,
      codec,
      true,
    ),
    recent = await readHistory(
      db,
      { inventoryId, route: 'history', search: '' },
      5,
      undefined,
      codec,
    );
  return {
    ...range,
    sales: {
      totalAmount: aggregate.total,
      estimatedProfit:
        aggregate.count === '0'
          ? '0'
          : aggregate.count !== aggregate.known
            ? null
            : aggregate.profit,
      unitsSold: decodeMoney(units.units),
    },
    topSelling: top
      ? {
          productId: top.productId,
          name: top.name,
          variant: top.variant,
          unitsSold: decodeMoney(top.units),
        }
      : null,
    lowStock: lowStock.items,
    recent: recent.items,
  };
}
