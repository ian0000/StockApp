import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  contractSchemas,
  createSchemaValidator,
  decodeMoney,
  type AdjustmentDto,
  type HistoryEntryDto,
  type HistoryPage,
} from '@stock-app/contracts';
import { createStockAdjustment } from '@stock-app/domain';
import {
  sales,
  saleItems,
  purchases,
  stockAdjustments,
  products,
} from '../infrastructure/postgres/schema.js';
import { saleFromRow } from '../void-sales/mappers.js';
import { purchaseFromRow } from '../void-purchases/mappers.js';
import { transportMoney } from '../purchases/mappers.js';
import { moneyTransport } from '../sales/mappers.js';
import type { ReadDatabase } from './products.js';
import type { ReadScope, createReadCursor } from './cursor.js';

const validateAdjustment = createSchemaValidator(
  contractSchemas.StockAdjustment,
);
function assertAdjustment(value: unknown): asserts value is AdjustmentDto {
  validateAdjustment(value);
}
function adjustmentFromRow(row: typeof stockAdjustments.$inferSelect) {
  const value = {
    id: row.id,
    inventoryId: row.inventoryId,
    productId: row.productId,
    stockBefore: decodeMoney(row.stockBefore.toString()),
    actualStock: decodeMoney(row.actualStock.toString()),
    difference: decodeMoney(row.difference.toString()),
    reason: row.reason,
    costMode: row.costMode,
    unitCost: row.unitCostUnits.toString(),
    effectiveAt: decodeMoney(row.effectiveAt.toString()),
    createdAt: decodeMoney(row.createdAt.toString()),
    updatedAt: decodeMoney(row.updatedAt.toString()),
  };
  assertAdjustment(value);
  return createStockAdjustment({
    ...value,
    unitCost: transportMoney(value.unitCost)!,
  });
}

export async function readHistory(
  db: ReadDatabase,
  scope: ReadScope,
  limit: number,
  cursor: string | undefined,
  codec: ReturnType<typeof createReadCursor>,
): Promise<HistoryPage> {
  const position = codec.decode(cursor, scope);
  function after(
    table: typeof sales | typeof purchases | typeof stockAdjustments,
    type: string,
  ) {
    return position
      ? sql`(${table.effectiveAt},${table.createdAt},${table.id},${type}::text COLLATE "C") < (${BigInt(position.effectiveAt!)},${BigInt(position.createdAt)},${position.id}::uuid,${position.type}::text COLLATE "C")`
      : undefined;
  }
  const saleRows = await db
    .select()
    .from(sales)
    .where(and(eq(sales.inventoryId, scope.inventoryId), after(sales, 'SALE')))
    .orderBy(desc(sales.effectiveAt), desc(sales.createdAt), desc(sales.id))
    .limit(limit + 1);
  const purchaseRows = await db
    .select({
      purchase: purchases,
      name: products.name,
      variant: products.variant,
    })
    .from(purchases)
    .leftJoin(
      products,
      and(
        eq(products.inventoryId, scope.inventoryId),
        eq(products.id, purchases.productId),
      ),
    )
    .where(
      and(
        eq(purchases.inventoryId, scope.inventoryId),
        after(purchases, 'PURCHASE'),
      ),
    )
    .orderBy(
      desc(purchases.effectiveAt),
      desc(purchases.createdAt),
      desc(purchases.id),
    )
    .limit(limit + 1);
  const adjustmentRows = await db
    .select({
      adjustment: stockAdjustments,
      name: products.name,
      variant: products.variant,
    })
    .from(stockAdjustments)
    .leftJoin(
      products,
      and(
        eq(products.inventoryId, scope.inventoryId),
        eq(products.id, stockAdjustments.productId),
      ),
    )
    .where(
      and(
        eq(stockAdjustments.inventoryId, scope.inventoryId),
        after(stockAdjustments, 'ADJUSTMENT'),
      ),
    )
    .orderBy(
      desc(stockAdjustments.effectiveAt),
      desc(stockAdjustments.createdAt),
      desc(stockAdjustments.id),
    )
    .limit(limit + 1);
  const units = saleRows.length
    ? await db
        .select({
          saleId: saleItems.saleId,
          units: sql<string>`sum(${saleItems.quantity})::text`,
        })
        .from(saleItems)
        .where(
          and(
            eq(saleItems.inventoryId, scope.inventoryId),
            inArray(
              saleItems.saleId,
              saleRows.map((s) => s.id),
            ),
          ),
        )
        .groupBy(saleItems.saleId)
    : [];
  const entries: HistoryEntryDto[] = saleRows.map((row) => {
    const sale = saleFromRow(row),
      count = units.find((u) => u.saleId === sale.id);
    if (!count) throw new Error('Missing history SaleItems.');
    return {
      type: 'SALE',
      id: sale.id,
      status: sale.status,
      totalAmount: moneyTransport(sale.totalAmount)!,
      units: decodeMoney(count.units),
      effectiveAt: sale.effectiveAt,
      createdAt: sale.createdAt,
    };
  });
  for (const row of purchaseRows) {
    if (row.name === null)
      throw new Error('Missing required Purchase history metadata.');
    const p = purchaseFromRow(row.purchase);
    entries.push({
      type: 'PURCHASE',
      id: p.id,
      productId: p.productId,
      productName: row.name,
      productVariant: row.variant,
      quantity: p.quantity,
      unitCost: moneyTransport(p.unitCost)!,
      totalAmount: moneyTransport(p.totalAmount)!,
      status: p.status,
      effectiveAt: p.effectiveAt,
      createdAt: p.createdAt,
    });
  }
  for (const row of adjustmentRows) {
    if (row.name === null)
      throw new Error('Missing required Adjustment history metadata.');
    const a = adjustmentFromRow(row.adjustment);
    entries.push({
      type: 'ADJUSTMENT',
      id: a.id,
      productId: a.productId,
      productName: row.name,
      productVariant: row.variant,
      difference: a.difference,
      reason: a.reason,
      effectiveAt: a.effectiveAt,
      createdAt: a.createdAt,
    });
  }
  entries.sort((a, b) =>
    a.effectiveAt === b.effectiveAt
      ? a.createdAt === b.createdAt
        ? a.id === b.id
          ? a.type === b.type
            ? 0
            : a.type < b.type
              ? 1
              : -1
          : a.id < b.id
            ? 1
            : -1
        : a.createdAt < b.createdAt
          ? 1
          : -1
      : a.effectiveAt < b.effectiveAt
        ? 1
        : -1,
  );
  const visible = entries.slice(0, limit),
    last = visible.at(-1),
    more = entries.length > limit;
  return {
    items: visible,
    nextCursor:
      more && last
        ? codec.encode(scope, {
            effectiveAt: last.effectiveAt,
            createdAt: last.createdAt,
            id: last.id,
            type: last.type,
          })
        : null,
  };
}
