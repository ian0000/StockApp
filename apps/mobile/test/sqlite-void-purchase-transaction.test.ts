import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';

import {
  GetPurchaseDetailsUseCase,
  GetSalesSummaryUseCase,
  ListHistoryUseCase,
  VoidPurchaseUseCase,
  type TransactionManager,
} from '@stock-app/application';
import { Money } from '@stock-app/domain';
import { drizzle } from 'drizzle-orm/sqlite-proxy';

import {
  createSqliteHistoryReader,
  createSqlitePurchaseDetailsReader,
  createSqliteSalesSummaryReader,
  createSqliteTransactionRepositories,
} from '../src/infrastructure/sqlite/repositories/repositories';

const TIMESTAMP = 1_776_444_000_000;
const MIGRATION_FILES = [
  '0000_cool_purple_man.sql',
  '0001_confused_naoko.sql',
  '0002_absent_goblin_queen.sql',
  '0003_sparkling_nuke.sql',
] as const;

interface PurchaseSeed {
  readonly quantity: number;
  readonly unitCostUnits: number;
  readonly averageCostBeforeUnits: number | null;
  readonly averageCostAfterUnits: number;
  readonly stockBefore: number;
  readonly stockAfter: number;
}

const DEFAULT_PURCHASE: PurchaseSeed = {
  quantity: 10,
  unitCostUnits: 20_000_000,
  averageCostBeforeUnits: 10_000_000,
  averageCostAfterUnits: 15_000_000,
  stockBefore: 10,
  stockAfter: 20,
};

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

    if (method === 'run') {
      const result = statement.run(...params);
      return Object.assign({ rows: [] }, { changes: Number(result.changes) });
    }

    const rows = statement.all(...params).map((row) => Object.values(row));
    return { rows: method === 'get' ? (rows[0] ?? []) : rows };
  });
}

function seedVoidablePurchase(
  database: DatabaseSync,
  suffix: string,
  purchase: PurchaseSeed = DEFAULT_PURCHASE,
): void {
  const inventoryId = `inventory-${suffix}`;
  const productId = `product-${suffix}`;
  const purchaseId = `purchase-${suffix}`;
  const movementId = `movement-${suffix}`;

  database
    .prepare(
      'INSERT INTO inventories (id, name, currency, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(inventoryId, suffix, 'USD', TIMESTAMP - 10, TIMESTAMP - 10);
  database
    .prepare(
      `INSERT INTO products (
        id, inventory_id, name, regular_sale_price_units, is_archived,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      productId,
      inventoryId,
      suffix,
      99_000_000,
      1,
      TIMESTAMP - 10,
      TIMESTAMP - 10,
    );
  database
    .prepare(
      `INSERT INTO purchases (
        id, inventory_id, product_id, quantity, unit_cost_units,
        total_amount_units, effective_at, created_at, updated_at, status,
        notes, average_cost_before_units, average_cost_after_units,
        stock_before, stock_after
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      purchaseId,
      inventoryId,
      productId,
      purchase.quantity,
      purchase.unitCostUnits,
      purchase.quantity * purchase.unitCostUnits,
      TIMESTAMP,
      TIMESTAMP,
      TIMESTAMP,
      'CONFIRMED',
      'historical note',
      purchase.averageCostBeforeUnits,
      purchase.averageCostAfterUnits,
      purchase.stockBefore,
      purchase.stockAfter,
    );
  database
    .prepare(
      'INSERT INTO inventory_states (inventory_id, product_id, stock, unit_cost_units) VALUES (?, ?, ?, ?)',
    )
    .run(
      inventoryId,
      productId,
      purchase.stockAfter,
      purchase.averageCostAfterUnits,
    );
  database
    .prepare(
      `INSERT INTO inventory_movements (
        id, inventory_id, product_id, type, quantity_delta,
        unit_cost_snapshot_units, stock_before, stock_after,
        source_type, source_id, metadata, effective_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      movementId,
      inventoryId,
      productId,
      'PURCHASE',
      purchase.quantity,
      purchase.unitCostUnits,
      purchase.stockBefore,
      purchase.stockAfter,
      'PURCHASE',
      purchaseId,
      null,
      TIMESTAMP,
      TIMESTAMP,
      TIMESTAMP,
    );
}

function createHarness(database: DatabaseSync) {
  const drizzleDatabase = createNodeSqliteDrizzle(database);
  let idCalls = 0;
  let clockCalls = 0;
  const transactionManager: TransactionManager = {
    runInTransaction: (operation) =>
      drizzleDatabase.transaction((transaction) =>
        operation(
          createSqliteTransactionRepositories(
            transaction as unknown as Parameters<
              typeof createSqliteTransactionRepositories
            >[0],
          ),
        ),
      ),
  };
  const useCase = new VoidPurchaseUseCase({
    inventoryMovementIdGenerator: {
      generate() {
        idCalls += 1;
        return `reversal-${idCalls}`;
      },
    },
    clock: {
      now() {
        clockCalls += 1;
        return TIMESTAMP + 1;
      },
    },
    transactionManager,
  });

  return {
    useCase,
    getIdCalls: () => idCalls,
    getClockCalls: () => clockCalls,
    readExecutor: drizzleDatabase as unknown as Parameters<
      typeof createSqliteHistoryReader
    >[0],
  };
}

test('real SQLite commits one exact Purchase reversal and retry is idempotent', async () => {
  const database = openMigratedDatabase();

  try {
    seedVoidablePurchase(database, 'success');
    const harness = createHarness(database);
    const input = {
      inventoryId: 'inventory-success',
      purchaseId: 'purchase-success',
    };
    const first = await harness.useCase.execute(input);
    const second = await harness.useCase.execute(input);
    const purchase = database
      .prepare(
        `SELECT status, quantity, unit_cost_units, total_amount_units, notes,
                average_cost_before_units, average_cost_after_units,
                stock_before, stock_after, effective_at, created_at
         FROM purchases WHERE id = ?`,
      )
      .get(input.purchaseId) as Record<string, unknown>;
    const state = database
      .prepare(
        'SELECT stock, unit_cost_units FROM inventory_states WHERE product_id = ?',
      )
      .get('product-success') as {
      readonly stock: number;
      readonly unit_cost_units: number | null;
    };
    const reversals = database
      .prepare(
        `SELECT type, source_type, source_id, quantity_delta,
                stock_before, stock_after, unit_cost_snapshot_units, metadata
         FROM inventory_movements WHERE type = 'REVERSAL'`,
      )
      .all();
    const originalCount = database
      .prepare(
        "SELECT count(*) AS count FROM inventory_movements WHERE type = 'PURCHASE'",
      )
      .get() as { readonly count: number };
    const product = database
      .prepare(
        'SELECT regular_sale_price_units, is_archived FROM products WHERE id = ?',
      )
      .get('product-success') as {
      readonly regular_sale_price_units: number;
      readonly is_archived: number;
    };
    const history = await new ListHistoryUseCase(
      createSqliteHistoryReader(harness.readExecutor),
    ).execute({ inventoryId: input.inventoryId, limit: 10 });
    const details = await new GetPurchaseDetailsUseCase(
      createSqlitePurchaseDetailsReader(harness.readExecutor),
    ).execute(input);
    const salesSummary = await new GetSalesSummaryUseCase(
      createSqliteSalesSummaryReader(harness.readExecutor),
    ).execute({
      inventoryId: input.inventoryId,
      fromInclusive: 0,
      toExclusive: Number.MAX_SAFE_INTEGER,
    });

    assert.equal(first.kind, 'VOIDED');
    assert.equal(second.kind, 'ALREADY_VOIDED');
    assert.equal(harness.getIdCalls(), 1);
    assert.equal(harness.getClockCalls(), 1);
    assert.equal(purchase.status, 'VOIDED');
    assert.equal(purchase.quantity, 10);
    assert.equal(purchase.unit_cost_units, 20_000_000);
    assert.equal(purchase.total_amount_units, 200_000_000);
    assert.equal(purchase.notes, 'historical note');
    assert.equal(purchase.average_cost_before_units, 10_000_000);
    assert.equal(purchase.average_cost_after_units, 15_000_000);
    assert.equal(purchase.stock_before, 10);
    assert.equal(purchase.stock_after, 20);
    assert.equal(purchase.effective_at, TIMESTAMP);
    assert.equal(purchase.created_at, TIMESTAMP);
    assert.deepEqual({ ...state }, { stock: 10, unit_cost_units: 10_000_000 });
    assert.deepEqual(
      reversals.map((row) => ({ ...row })),
      [
        {
          type: 'REVERSAL',
          source_type: 'INVENTORY_MOVEMENT',
          source_id: 'movement-success',
          quantity_delta: -10,
          stock_before: 20,
          stock_after: 10,
          unit_cost_snapshot_units: 20_000_000,
          metadata: null,
        },
      ],
    );
    assert.equal(originalCount.count, 1);
    assert.deepEqual(
      { ...product },
      {
        regular_sale_price_units: 99_000_000,
        is_archived: 1,
      },
    );
    assert.equal(history.length, 1);
    assert.equal(history[0]?.type, 'PURCHASE');
    assert.equal(
      history[0]?.type === 'PURCHASE' && history[0].status,
      'VOIDED',
    );
    assert.equal(details?.status, 'VOIDED');
    assert.equal(details?.stockBefore, 10);
    assert.equal(details?.stockAfter, 20);
    assert.equal(details?.averageCostBefore?.scaledUnits, 10_000_000);
    assert.equal(details?.averageCostAfter.scaledUnits, 15_000_000);
    assert.equal(salesSummary.totalAmount.equals(Money.zero()), true);
    assert.equal(salesSummary.unitsSold, 0);
    assert.equal(salesSummary.estimatedProfit?.equals(Money.zero()), true);
  } finally {
    database.close();
  }
});

for (const scenario of [
  {
    name: 'null cost and negative stock',
    seed: {
      quantity: 3,
      unitCostUnits: 12_000_000,
      averageCostBeforeUnits: null,
      averageCostAfterUnits: 12_000_000,
      stockBefore: -3,
      stockAfter: 0,
    },
  },
  {
    name: 'known zero cost',
    seed: {
      quantity: 10,
      unitCostUnits: 20_000_000,
      averageCostBeforeUnits: 0,
      averageCostAfterUnits: 10_000_000,
      stockBefore: 10,
      stockAfter: 20,
    },
  },
] as const) {
  test(`real SQLite restores ${scenario.name} exactly`, async () => {
    const database = openMigratedDatabase();

    try {
      seedVoidablePurchase(database, 'cost', scenario.seed);
      await createHarness(database).useCase.execute({
        inventoryId: 'inventory-cost',
        purchaseId: 'purchase-cost',
      });
      const state = database
        .prepare(
          'SELECT stock, unit_cost_units FROM inventory_states WHERE product_id = ?',
        )
        .get('product-cost') as {
        readonly stock: number;
        readonly unit_cost_units: number | null;
      };

      assert.equal(state.stock, scenario.seed.stockBefore);
      assert.equal(state.unit_cost_units, scenario.seed.averageCostBeforeUnits);
    } finally {
      database.close();
    }
  });
}

for (const offset of [0, 1]) {
  test(`real SQLite blocks a competing movement at createdAt offset ${offset}`, async () => {
    const database = openMigratedDatabase();

    try {
      seedVoidablePurchase(database, 'later');
      database
        .prepare(
          `INSERT INTO inventory_movements (
            id, inventory_id, product_id, type, quantity_delta,
            unit_cost_snapshot_units, stock_before, stock_after,
            source_type, source_id, metadata, effective_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'later-movement',
          'inventory-later',
          'product-later',
          'SALE',
          -1,
          15_000_000,
          20,
          19,
          'SALE',
          'sale-later',
          null,
          TIMESTAMP + offset,
          TIMESTAMP + offset,
          TIMESTAMP + offset,
        );
      const result = await createHarness(database).useCase.execute({
        inventoryId: 'inventory-later',
        purchaseId: 'purchase-later',
      });

      assert.equal(result.kind, 'NOT_ELIGIBLE');
      assert.equal(
        (
          database
            .prepare(
              "SELECT count(*) AS count FROM inventory_movements WHERE type = 'REVERSAL'",
            )
            .get() as { readonly count: number }
        ).count,
        0,
      );
    } finally {
      database.close();
    }
  });
}

for (const failure of [
  {
    name: 'REVERSAL insert',
    trigger: `
      CREATE TRIGGER fail_purchase_reversal_insert
      BEFORE INSERT ON inventory_movements
      WHEN NEW.type = 'REVERSAL'
      BEGIN
        SELECT RAISE(ABORT, 'controlled reversal failure');
      END;
    `,
  },
  {
    name: 'InventoryState update',
    trigger: `
      CREATE TRIGGER fail_purchase_state_update
      BEFORE UPDATE ON inventory_states
      WHEN OLD.product_id = 'product-rollback'
      BEGIN
        SELECT RAISE(ABORT, 'controlled state failure');
      END;
    `,
  },
  {
    name: 'Purchase update',
    trigger: `
      CREATE TRIGGER fail_purchase_status_update
      BEFORE UPDATE ON purchases
      WHEN OLD.id = 'purchase-rollback'
      BEGIN
        SELECT RAISE(ABORT, 'controlled purchase failure');
      END;
    `,
  },
] as const) {
  test(`real SQLite rolls back the complete void after ${failure.name} failure`, async () => {
    const database = openMigratedDatabase();

    try {
      seedVoidablePurchase(database, 'rollback');
      database.exec(failure.trigger);

      await assert.rejects(
        () =>
          createHarness(database).useCase.execute({
            inventoryId: 'inventory-rollback',
            purchaseId: 'purchase-rollback',
          }),
        /Failed query/,
      );

      const purchase = database
        .prepare('SELECT status FROM purchases WHERE id = ?')
        .get('purchase-rollback') as { readonly status: string };
      const state = database
        .prepare(
          'SELECT stock, unit_cost_units FROM inventory_states WHERE product_id = ?',
        )
        .get('product-rollback') as {
        readonly stock: number;
        readonly unit_cost_units: number | null;
      };
      const reversalCount = database
        .prepare(
          "SELECT count(*) AS count FROM inventory_movements WHERE type = 'REVERSAL'",
        )
        .get() as { readonly count: number };

      assert.equal(purchase.status, 'CONFIRMED');
      assert.deepEqual(
        { ...state },
        { stock: 20, unit_cost_units: 15_000_000 },
      );
      assert.equal(reversalCount.count, 0);
    } finally {
      database.close();
    }
  });
}
