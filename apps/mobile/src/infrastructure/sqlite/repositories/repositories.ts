import {
  compareHistoryEntriesNewestFirst,
  type HistoryEntry,
  type HistoryReader,
  type PurchaseDetailsReader,
  type SaleDetailsReader,
  InventoryRepository,
  InventoryMovementRepository,
  InventoryStateRepository,
  ProductManagementRepository,
  ProductRepository,
  PurchaseRepository,
  SaleItemRepository,
  SaleRepository,
  SalesSummaryReader,
  StockAdjustmentRepository,
  TransactionRepositories,
} from '@stock-app/application';
import { and, asc, count, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { createTimestampMs, Money } from '@stock-app/domain';

import type { AppDatabase } from '../database';
import {
  inventories,
  inventoryMovements,
  inventoryStates,
  products,
  purchases,
  saleItems,
  sales,
  stockAdjustments,
} from '../schema';
import {
  mapInventoryToRow,
  mapInventoryRowToDomain,
  mapInventoryMovementToRow,
  mapInventoryStateRowToRecord,
  mapInventoryStateToRow,
  mapProductRowToDomain,
  mapProductToRow,
  mapPurchaseRowToDomain,
  mapPurchaseToRow,
  mapSaleItemToRow,
  mapSaleItemRowToDomain,
  mapSaleRowToDomain,
  mapSaleToRow,
  mapStockAdjustmentToRow,
} from './mappers';
import { createSqliteVoidSaleTransaction } from './void-sale';
import { createSqliteVoidPurchaseTransaction } from './void-purchase';

type SqliteRepositoryExecutor = Pick<AppDatabase['db'], 'insert' | 'select'>;
type SqliteReadExecutor = Pick<AppDatabase['db'], 'select'>;
type SqliteProductRepositoryExecutor = Pick<
  AppDatabase['db'],
  'insert' | 'select' | 'update'
>;
type SqliteInventoryStateExecutor = Pick<
  AppDatabase['db'],
  'insert' | 'select' | 'update'
>;

export function createInventoryRepository(
  executor: SqliteRepositoryExecutor,
): InventoryRepository {
  return {
    async list() {
      const rows = await executor.select().from(inventories);

      return rows.map(mapInventoryRowToDomain);
    },
    async save(inventory) {
      executor.insert(inventories).values(mapInventoryToRow(inventory)).run();
    },
  };
}

export function createSqliteProductRepository(
  executor: SqliteProductRepositoryExecutor,
): ProductRepository & ProductManagementRepository {
  return {
    async findById(inventoryId, productId) {
      const rows = await executor
        .select()
        .from(products)
        .where(
          and(
            eq(products.inventoryId, inventoryId),
            eq(products.id, productId),
          ),
        )
        .limit(1);

      const row = rows[0];
      return row === undefined ? null : mapProductRowToDomain(row);
    },
    async listByInventory(inventoryId) {
      const rows = await executor
        .select()
        .from(products)
        .where(
          and(
            eq(products.inventoryId, inventoryId),
            eq(products.isArchived, false),
          ),
        )
        .orderBy(desc(products.createdAt), desc(products.id));

      return rows.map(mapProductRowToDomain);
    },
    async save(product) {
      executor.insert(products).values(mapProductToRow(product)).run();
    },
    async update(product) {
      const result = executor
        .update(products)
        .set({
          name: product.name,
          variant: product.variant,
          barcode: product.barcode,
          regularSalePriceUnits: product.regularSalePrice.scaledUnits,
          minimumStock: product.minimumStock,
          isArchived: product.isArchived,
          updatedAt: product.updatedAt,
        })
        .where(
          and(
            eq(products.inventoryId, product.inventoryId),
            eq(products.id, product.id),
          ),
        )
        .run();

      if (result.changes !== 1) {
        throw new Error(
          `Expected to update one Product, updated ${result.changes}.`,
        );
      }
    },
  };
}

export function createSqliteInventoryStateRepository(
  executor: SqliteInventoryStateExecutor,
): InventoryStateRepository {
  return {
    async listByInventory(inventoryId) {
      const rows = await executor
        .select()
        .from(inventoryStates)
        .where(eq(inventoryStates.inventoryId, inventoryId))
        .orderBy(asc(inventoryStates.productId));

      return rows.map(mapInventoryStateRowToRecord);
    },
    async save(input) {
      executor
        .insert(inventoryStates)
        .values(mapInventoryStateToRow(input))
        .run();
    },
    async update(input) {
      const result = executor
        .update(inventoryStates)
        .set({
          stock: input.state.stock,
          unitCostUnits: input.state.unitCost?.scaledUnits ?? null,
        })
        .where(
          and(
            eq(inventoryStates.inventoryId, input.inventoryId),
            eq(inventoryStates.productId, input.productId),
          ),
        )
        .run();

      if (result.changes !== 1) {
        throw new Error(
          `Expected to update one InventoryState, updated ${result.changes}.`,
        );
      }
    },
  };
}

export function createSqliteInventoryMovementRepository(
  executor: SqliteRepositoryExecutor,
): InventoryMovementRepository {
  return {
    async save(movement) {
      executor
        .insert(inventoryMovements)
        .values(mapInventoryMovementToRow(movement))
        .run();
    },
  };
}

export function createSqlitePurchaseRepository(
  executor: Pick<AppDatabase['db'], 'insert'>,
): PurchaseRepository {
  return {
    async save(purchase) {
      executor.insert(purchases).values(mapPurchaseToRow(purchase)).run();
    },
  };
}

export function createSqliteSaleRepository(
  executor: Pick<AppDatabase['db'], 'insert'>,
): SaleRepository {
  return {
    async save(sale) {
      executor.insert(sales).values(mapSaleToRow(sale)).run();
    },
  };
}

export function createSqliteSaleItemRepository(
  executor: Pick<AppDatabase['db'], 'insert'>,
): SaleItemRepository {
  return {
    async save(item) {
      executor.insert(saleItems).values(mapSaleItemToRow(item)).run();
    },
  };
}

export function createSqliteStockAdjustmentRepository(
  executor: Pick<AppDatabase['db'], 'insert'>,
): StockAdjustmentRepository {
  return {
    async save(adjustment) {
      executor
        .insert(stockAdjustments)
        .values(mapStockAdjustmentToRow(adjustment))
        .run();
    },
  };
}

function requireSafeAggregate(
  value: number | null,
  label: string,
  fallback: number,
): number {
  const aggregate = value ?? fallback;

  if (!Number.isSafeInteger(aggregate)) {
    throw new RangeError(`${label} must be a safe integer.`);
  }

  return aggregate;
}

function requireNonNegativeAggregate(
  value: number | null,
  label: string,
  fallback: number,
): number {
  const aggregate = requireSafeAggregate(value, label, fallback);

  if (aggregate < 0) {
    throw new RangeError(`${label} must not be negative.`);
  }

  return aggregate;
}

function requirePresentSafeAggregate(
  value: number | null,
  label: string,
): number {
  if (value === null) {
    throw new Error(`${label} is missing.`);
  }

  return requireSafeAggregate(value, label, 0);
}

export function createSqliteSalesSummaryReader(
  executor: SqliteReadExecutor,
): SalesSummaryReader {
  return {
    async getSummary({ inventoryId, fromInclusive, toExclusive }) {
      const confirmedInRange = and(
        eq(sales.inventoryId, inventoryId),
        eq(sales.status, 'CONFIRMED'),
        gte(sales.effectiveAt, fromInclusive),
        lt(sales.effectiveAt, toExclusive),
      );
      const [saleAggregates, unitAggregates] = await Promise.all([
        executor
          .select({
            saleCount: count(),
            knownProfitCount: count(sales.estimatedProfitUnits),
            totalAmountUnits: sql<
              number | null
            >`sum(${sales.totalAmountUnits})`,
            estimatedProfitUnits: sql<
              number | null
            >`sum(${sales.estimatedProfitUnits})`,
          })
          .from(sales)
          .where(confirmedInRange),
        executor
          .select({
            unitsSold: sql<number | null>`sum(${saleItems.quantity})`,
          })
          .from(saleItems)
          .innerJoin(sales, eq(saleItems.saleId, sales.id))
          .where(confirmedInRange),
      ]);
      const saleAggregate = saleAggregates[0];
      const unitAggregate = unitAggregates[0];

      if (saleAggregate === undefined || unitAggregate === undefined) {
        throw new Error('SQLite sales summary aggregate is missing.');
      }

      const saleCount = requireNonNegativeAggregate(
        saleAggregate.saleCount,
        'Sale count',
        0,
      );
      const knownProfitCount = requireNonNegativeAggregate(
        saleAggregate.knownProfitCount,
        'Known profit count',
        0,
      );

      if (knownProfitCount > saleCount) {
        throw new RangeError('Known profit count must not exceed sale count.');
      }

      const totalAmountUnits =
        saleCount === 0
          ? 0
          : requirePresentSafeAggregate(
              saleAggregate.totalAmountUnits,
              'Total sales scaled units',
            );
      const knownProfitUnits =
        saleAggregate.estimatedProfitUnits === null
          ? null
          : requireSafeAggregate(
              saleAggregate.estimatedProfitUnits,
              'Estimated profit scaled units',
              0,
            );
      const estimatedProfit =
        saleCount === 0
          ? Money.zero()
          : knownProfitCount < saleCount
            ? null
            : Money.fromScaledUnits(
                requirePresentSafeAggregate(
                  knownProfitUnits,
                  'Estimated profit scaled units',
                ),
              );

      return Object.freeze({
        totalAmount: Money.fromScaledUnits(totalAmountUnits),
        estimatedProfit,
        unitsSold: requireNonNegativeAggregate(
          unitAggregate.unitsSold,
          'Units sold',
          0,
        ),
      });
    },
  };
}

function requireSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer.`);
  }

  return value;
}

function requirePositiveSafeInteger(value: number, label: string): number {
  const normalized = requireSafeInteger(value, label);

  if (normalized <= 0) {
    throw new RangeError(`${label} must be greater than zero.`);
  }

  return normalized;
}

function requireNonZeroSafeInteger(value: number, label: string): number {
  const normalized = requireSafeInteger(value, label);

  if (normalized === 0) {
    throw new RangeError(`${label} must be non-zero.`);
  }

  return normalized;
}

function moneyFromScaledUnits(value: number, label: string): Money {
  try {
    return Money.fromScaledUnits(value);
  } catch (error) {
    throw new RangeError(`${label} must contain safe integer scaled units.`, {
      cause: error,
    });
  }
}

export function createSqliteHistoryReader(
  executor: SqliteReadExecutor,
): HistoryReader {
  return {
    async listRecent({ inventoryId, limit }) {
      const [saleRows, purchaseRows, adjustmentRows] = await Promise.all([
        executor
          .select({
            id: sales.id,
            totalAmountUnits: sales.totalAmountUnits,
            status: sales.status,
            effectiveAt: sales.effectiveAt,
            createdAt: sales.createdAt,
            units: sql<number>`sum(${saleItems.quantity})`,
          })
          .from(sales)
          .innerJoin(saleItems, eq(saleItems.saleId, sales.id))
          .where(eq(sales.inventoryId, inventoryId))
          .groupBy(
            sales.id,
            sales.totalAmountUnits,
            sales.status,
            sales.effectiveAt,
            sales.createdAt,
          )
          .orderBy(
            desc(sales.effectiveAt),
            desc(sales.createdAt),
            desc(sales.id),
          )
          .limit(limit),
        executor
          .select({
            id: purchases.id,
            productId: purchases.productId,
            productName: products.name,
            productVariant: products.variant,
            quantity: purchases.quantity,
            unitCostUnits: purchases.unitCostUnits,
            totalAmountUnits: purchases.totalAmountUnits,
            status: purchases.status,
            effectiveAt: purchases.effectiveAt,
            createdAt: purchases.createdAt,
          })
          .from(purchases)
          .innerJoin(
            products,
            and(
              eq(products.inventoryId, purchases.inventoryId),
              eq(products.id, purchases.productId),
            ),
          )
          .where(eq(purchases.inventoryId, inventoryId))
          .orderBy(
            desc(purchases.effectiveAt),
            desc(purchases.createdAt),
            desc(purchases.id),
          )
          .limit(limit),
        executor
          .select({
            id: stockAdjustments.id,
            productId: stockAdjustments.productId,
            productName: products.name,
            productVariant: products.variant,
            difference: stockAdjustments.difference,
            reason: stockAdjustments.reason,
            effectiveAt: stockAdjustments.effectiveAt,
            createdAt: stockAdjustments.createdAt,
          })
          .from(stockAdjustments)
          .innerJoin(
            products,
            and(
              eq(products.inventoryId, stockAdjustments.inventoryId),
              eq(products.id, stockAdjustments.productId),
            ),
          )
          .where(eq(stockAdjustments.inventoryId, inventoryId))
          .orderBy(
            desc(stockAdjustments.effectiveAt),
            desc(stockAdjustments.createdAt),
            desc(stockAdjustments.id),
          )
          .limit(limit),
      ]);

      const saleEntries: HistoryEntry[] = saleRows.map((row) =>
        Object.freeze({
          type: 'SALE' as const,
          id: row.id,
          totalAmount: moneyFromScaledUnits(
            row.totalAmountUnits,
            'Sale total amount',
          ),
          units: requirePositiveSafeInteger(row.units, 'Sale units'),
          status: row.status,
          effectiveAt: createTimestampMs(row.effectiveAt, 'Sale effective at'),
          createdAt: createTimestampMs(row.createdAt, 'Sale created at'),
        }),
      );
      const purchaseEntries: HistoryEntry[] = purchaseRows.map((row) =>
        Object.freeze({
          type: 'PURCHASE' as const,
          id: row.id,
          productId: row.productId,
          productName: row.productName,
          productVariant: row.productVariant,
          quantity: requirePositiveSafeInteger(
            row.quantity,
            'Purchase quantity',
          ),
          unitCost: moneyFromScaledUnits(
            row.unitCostUnits,
            'Purchase unit cost',
          ),
          totalAmount: moneyFromScaledUnits(
            row.totalAmountUnits,
            'Purchase total amount',
          ),
          status: row.status,
          effectiveAt: createTimestampMs(
            row.effectiveAt,
            'Purchase effective at',
          ),
          createdAt: createTimestampMs(row.createdAt, 'Purchase created at'),
        }),
      );
      const adjustmentEntries: HistoryEntry[] = adjustmentRows.map((row) =>
        Object.freeze({
          type: 'ADJUSTMENT' as const,
          id: row.id,
          productId: row.productId,
          productName: row.productName,
          productVariant: row.productVariant,
          difference: requireNonZeroSafeInteger(
            row.difference,
            'Stock adjustment difference',
          ),
          reason: row.reason,
          effectiveAt: createTimestampMs(
            row.effectiveAt,
            'Stock adjustment effective at',
          ),
          createdAt: createTimestampMs(
            row.createdAt,
            'Stock adjustment created at',
          ),
        }),
      );

      return Object.freeze(
        [...saleEntries, ...purchaseEntries, ...adjustmentEntries]
          .sort(compareHistoryEntriesNewestFirst)
          .slice(0, limit),
      );
    },
  };
}

export function createSqliteSaleDetailsReader(
  executor: SqliteReadExecutor,
): SaleDetailsReader {
  return {
    async findById({ inventoryId, saleId }) {
      const saleRows = await executor
        .select({
          id: sales.id,
          inventoryId: sales.inventoryId,
          effectiveAt: sales.effectiveAt,
          createdAt: sales.createdAt,
          updatedAt: sales.updatedAt,
          status: sales.status,
          totalAmountUnits: sales.totalAmountUnits,
          estimatedCostUnits: sales.estimatedCostUnits,
          estimatedProfitUnits: sales.estimatedProfitUnits,
          notes: sales.notes,
        })
        .from(sales)
        .where(and(eq(sales.inventoryId, inventoryId), eq(sales.id, saleId)))
        .limit(1);
      const saleRow = saleRows[0];

      if (saleRow === undefined) return null;

      const itemRows = await executor
        .select({
          id: saleItems.id,
          saleId: saleItems.saleId,
          productId: saleItems.productId,
          quantity: saleItems.quantity,
          unitSalePriceUnits: saleItems.unitSalePriceUnits,
          subtotalUnits: saleItems.subtotalUnits,
          unitCostSnapshotUnits: saleItems.unitCostSnapshotUnits,
          estimatedCostUnits: saleItems.estimatedCostUnits,
          estimatedProfitUnits: saleItems.estimatedProfitUnits,
          costStatus: saleItems.costStatus,
          createdAt: saleItems.createdAt,
          updatedAt: saleItems.updatedAt,
          productName: products.name,
          productVariant: products.variant,
        })
        .from(saleItems)
        .leftJoin(products, eq(products.id, saleItems.productId))
        .where(eq(saleItems.saleId, saleId))
        .orderBy(asc(saleItems.createdAt), asc(saleItems.id));

      return Object.freeze({
        sale: mapSaleRowToDomain(saleRow),
        items: Object.freeze(
          itemRows.map(({ productName, productVariant, ...itemRow }) =>
            Object.freeze({
              item: mapSaleItemRowToDomain(itemRow),
              productName,
              productVariant,
            }),
          ),
        ),
      });
    },
  };
}

export function createSqlitePurchaseDetailsReader(
  executor: SqliteReadExecutor,
): PurchaseDetailsReader {
  return {
    async findById({ inventoryId, purchaseId }) {
      const rows = await executor
        .select({
          id: purchases.id,
          inventoryId: purchases.inventoryId,
          productId: purchases.productId,
          quantity: purchases.quantity,
          unitCostUnits: purchases.unitCostUnits,
          totalAmountUnits: purchases.totalAmountUnits,
          effectiveAt: purchases.effectiveAt,
          createdAt: purchases.createdAt,
          updatedAt: purchases.updatedAt,
          status: purchases.status,
          notes: purchases.notes,
          averageCostBeforeUnits: purchases.averageCostBeforeUnits,
          averageCostAfterUnits: purchases.averageCostAfterUnits,
          stockBefore: purchases.stockBefore,
          stockAfter: purchases.stockAfter,
          productName: products.name,
          productVariant: products.variant,
        })
        .from(purchases)
        .leftJoin(
          products,
          and(
            eq(products.inventoryId, purchases.inventoryId),
            eq(products.id, purchases.productId),
          ),
        )
        .where(
          and(
            eq(purchases.inventoryId, inventoryId),
            eq(purchases.id, purchaseId),
          ),
        )
        .limit(1);
      const row = rows[0];

      if (row === undefined) return null;

      const { productName, productVariant, ...purchaseRow } = row;

      return Object.freeze({
        purchase: mapPurchaseRowToDomain(purchaseRow),
        productName,
        productVariant,
      });
    },
  };
}

export function createSqliteTransactionRepositories(
  executor: SqliteInventoryStateExecutor,
): TransactionRepositories {
  return Object.freeze({
    productRepository: createSqliteProductRepository(executor),
    inventoryStateRepository: createSqliteInventoryStateRepository(executor),
    inventoryMovementRepository:
      createSqliteInventoryMovementRepository(executor),
    purchaseRepository: createSqlitePurchaseRepository(executor),
    saleRepository: createSqliteSaleRepository(executor),
    saleItemRepository: createSqliteSaleItemRepository(executor),
    stockAdjustmentRepository: createSqliteStockAdjustmentRepository(executor),
    saleVoidRepository: createSqliteVoidSaleTransaction(executor),
    purchaseVoidRepository: createSqliteVoidPurchaseTransaction(executor),
  });
}
