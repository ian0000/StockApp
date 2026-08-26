import type {
  InventoryRepository,
  InventoryMovementRepository,
  InventoryStateRepository,
  ProductRepository,
  PurchaseRepository,
  SaleItemRepository,
  SaleRepository,
  SalesSummaryReader,
  StockAdjustmentRepository,
  TransactionRepositories,
} from '@stock-app/application';
import { and, asc, count, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { Money } from '@stock-app/domain';

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
  mapPurchaseToRow,
  mapSaleItemToRow,
  mapSaleToRow,
  mapStockAdjustmentToRow,
} from './mappers';

type SqliteRepositoryExecutor = Pick<AppDatabase['db'], 'insert' | 'select'>;
type SqliteReadExecutor = Pick<AppDatabase['db'], 'select'>;
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
  executor: SqliteRepositoryExecutor,
): ProductRepository {
  return {
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
  });
}
