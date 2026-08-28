import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';

import {
  GetSaleDetailsUseCase,
  GetSalesSummaryUseCase,
  ListHistoryUseCase,
  VoidSaleUseCase,
  type TransactionManager,
} from '@stock-app/application';
import {
  createInventoryMovement,
  createInventoryState,
  createSale,
  Money,
} from '@stock-app/domain';
import { drizzle } from 'drizzle-orm/sqlite-proxy';

import {
  createSqliteHistoryReader,
  createSqliteSaleDetailsReader,
  createSqliteSalesSummaryReader,
  createSqliteTransactionRepositories,
} from '../src/infrastructure/sqlite/repositories/repositories';
import { createSqliteVoidSaleTransaction } from '../src/infrastructure/sqlite/repositories/void-sale';
import {
  inventoryMovements,
  inventoryStates,
  sales,
} from '../src/infrastructure/sqlite/schema';

const TIMESTAMP = 1_776_444_000_000;
const MIGRATION_FILES = [
  '0000_cool_purple_man.sql',
  '0001_confused_naoko.sql',
  '0002_absent_goblin_queen.sql',
  '0003_sparkling_nuke.sql',
] as const;

interface RecordedQuery {
  readonly sql: string;
  readonly params: readonly unknown[];
  readonly method: string;
}

function createReadFixture() {
  const queries: RecordedQuery[] = [];
  const database = drizzle(async (sql, params, method) => {
    queries.push({ sql, params, method });

    if (sql.includes('from "sales"')) {
      return {
        rows: [
          [
            'sale-1',
            'inventory-1',
            TIMESTAMP,
            TIMESTAMP,
            TIMESTAMP,
            'CONFIRMED',
            6_000_000,
            3_000_000,
            3_000_000,
            null,
          ],
        ],
      };
    }
    if (sql.includes('from "sale_items"')) {
      return {
        rows: [
          [
            'item-1',
            'sale-1',
            'product-1',
            2,
            3_000_000,
            6_000_000,
            1_500_000,
            3_000_000,
            3_000_000,
            'KNOWN',
            TIMESTAMP,
            TIMESTAMP,
          ],
        ],
      };
    }
    if (sql.includes('from "inventory_states"')) {
      return { rows: [['inventory-1', 'product-1', 3, 1_500_000]] };
    }
    if (sql.includes('from "inventory_movements"')) {
      return {
        rows: [
          [
            'movement-1',
            'inventory-1',
            'product-1',
            'SALE',
            -2,
            1_500_000,
            5,
            3,
            'SALE',
            'sale-1',
            null,
            TIMESTAMP,
            TIMESTAMP,
            TIMESTAMP,
          ],
        ],
      };
    }

    return { rows: [] };
  });

  return {
    queries,
    transaction: createSqliteVoidSaleTransaction(
      database as unknown as Parameters<
        typeof createSqliteVoidSaleTransaction
      >[0],
    ),
  };
}

test('SQLite void reads map exact Domain values and scope Sale by inventory', async () => {
  const fixture = createReadFixture();
  const storedSale = await fixture.transaction.findSale(
    'inventory-1',
    'sale-1',
  );
  const items = await fixture.transaction.listSaleItems('sale-1');
  const states = await fixture.transaction.listInventoryStates('inventory-1');

  assert.equal(storedSale?.totalAmount.scaledUnits, 6_000_000);
  assert.equal(items[0]?.unitCostSnapshot?.scaledUnits, 1_500_000);
  assert.equal(states[0]?.state.unitCost?.scaledUnits, 1_500_000);
  assert.match(fixture.queries[0]?.sql ?? '', /"sales"\."inventory_id" = \?/);
  assert.deepEqual(fixture.queries[0]?.params, ['inventory-1', 'sale-1', 1]);
});

test('original SALE lookup uses canonical type and source association', async () => {
  const fixture = createReadFixture();
  const movements = await fixture.transaction.listOriginalSaleMovements(
    'inventory-1',
    'sale-1',
  );

  assert.equal(movements[0]?.type, 'SALE');
  assert.equal(movements[0]?.sourceType, 'SALE');
  assert.equal(movements[0]?.sourceId, 'sale-1');
  assert.deepEqual(fixture.queries[0]?.params, [
    'inventory-1',
    'SALE',
    'SALE',
    'sale-1',
  ]);
});

test('REVERSAL lookup is scoped by inventory and original movement IDs', async () => {
  const fixture = createReadFixture();
  await fixture.transaction.listReversals('inventory-1', [
    'movement-1',
    'movement-2',
  ]);

  assert.deepEqual(fixture.queries[0]?.params, [
    'inventory-1',
    'REVERSAL',
    'INVENTORY_MOVEMENT',
    'movement-1',
    'movement-2',
  ]);
});

test('empty original movement set avoids an invalid REVERSAL query', async () => {
  const fixture = createReadFixture();
  assert.deepEqual(
    await fixture.transaction.listReversals('inventory-1', []),
    [],
  );
  assert.equal(fixture.queries.length, 0);
});

test('eligibility movement query includes inventory, product and createdAt lower bound', async () => {
  const fixture = createReadFixture();
  await fixture.transaction.listProductMovementsAtOrAfter({
    inventoryId: 'inventory-1',
    productId: 'product-1',
    createdAt: TIMESTAMP,
  });

  assert.deepEqual(fixture.queries[0]?.params, [
    'inventory-1',
    'product-1',
    TIMESTAMP,
  ]);
  assert.match(fixture.queries[0]?.sql ?? '', /created_at" >= \?/);
});

type Executor = Parameters<typeof createSqliteVoidSaleTransaction>[0];

function createWriteFixture(changes = 1) {
  const inserted: { table: unknown; row: unknown }[] = [];
  const updated: { table: unknown; values: unknown }[] = [];
  const executor = {
    select() {
      throw new Error('Write test must not select.');
    },
    insert(table: unknown) {
      return {
        values(row: unknown) {
          inserted.push({ table, row });
          return { run() {} };
        },
      };
    },
    update(table: unknown) {
      return {
        set(values: unknown) {
          updated.push({ table, values });
          return {
            where() {
              return { run: () => ({ changes }) };
            },
          };
        },
      };
    },
  } as unknown as Executor;

  return {
    inserted,
    updated,
    transaction: createSqliteVoidSaleTransaction(executor),
  };
}

test('SQLite writes persist REVERSAL then exact InventoryState and only Sale status fields', async () => {
  const fixture = createWriteFixture();
  const reversal = createInventoryMovement({
    id: 'reversal-1',
    inventoryId: 'inventory-1',
    productId: 'product-1',
    type: 'REVERSAL',
    quantityDelta: 2,
    unitCostSnapshot: Money.zero(),
    stockBefore: -1,
    stockAfter: 1,
    sourceType: 'INVENTORY_MOVEMENT',
    sourceId: 'movement-1',
    metadata: null,
    effectiveAt: TIMESTAMP,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  });
  const voidedSale = createSale({
    id: 'sale-1',
    inventoryId: 'inventory-1',
    effectiveAt: TIMESTAMP - 1,
    createdAt: TIMESTAMP - 1,
    updatedAt: TIMESTAMP,
    status: 'VOIDED',
    totalAmount: Money.fromDecimal('1'),
    estimatedCost: null,
    estimatedProfit: null,
    notes: null,
  });

  await fixture.transaction.saveReversal(reversal);
  await fixture.transaction.updateInventoryState({
    inventoryId: 'inventory-1',
    productId: 'product-1',
    state: createInventoryState({ stock: 1, unitCost: Money.zero() }),
  });
  await fixture.transaction.updateSale(voidedSale);

  assert.equal(fixture.inserted[0]?.table, inventoryMovements);
  assert.equal(
    (fixture.inserted[0]?.row as { unitCostSnapshotUnits: number })
      .unitCostSnapshotUnits,
    0,
  );
  assert.deepEqual(fixture.updated, [
    { table: inventoryStates, values: { stock: 1, unitCostUnits: 0 } },
    { table: sales, values: { status: 'VOIDED', updatedAt: TIMESTAMP } },
  ]);
});

test('strict SQLite updates reject missing InventoryState or Sale rows', async () => {
  const fixture = createWriteFixture(0);
  await assert.rejects(
    () =>
      fixture.transaction.updateInventoryState({
        inventoryId: 'inventory-1',
        productId: 'product-1',
        state: createInventoryState({ stock: 0, unitCost: null }),
      }),
    /Expected to update one InventoryState/,
  );
  await assert.rejects(
    () => fixture.transaction.updateSale(saleAsVoided()),
    /Expected to void one Sale/,
  );
});

function saleAsVoided() {
  return createSale({
    id: 'sale-1',
    inventoryId: 'inventory-1',
    effectiveAt: TIMESTAMP,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    status: 'VOIDED',
    totalAmount: Money.fromDecimal('1'),
    estimatedCost: null,
    estimatedProfit: null,
    notes: null,
  });
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

    if (method === 'run') {
      const result = statement.run(...params);
      return Object.assign({ rows: [] }, { changes: Number(result.changes) });
    }

    const rows = statement.all(...params).map((row) => Object.values(row));
    return { rows: method === 'get' ? (rows[0] ?? []) : rows };
  });
}

function seedVoidableSale(database: DatabaseSync, suffix: string): void {
  database
    .prepare(
      'INSERT INTO inventories (id, name, currency, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(`inventory-${suffix}`, suffix, 'USD', TIMESTAMP - 10, TIMESTAMP - 10);
  database
    .prepare(
      `INSERT INTO products (
        id, inventory_id, name, regular_sale_price_units, is_archived,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      `product-${suffix}`,
      `inventory-${suffix}`,
      suffix,
      2_000_000,
      1,
      TIMESTAMP - 10,
      TIMESTAMP - 10,
    );
  database
    .prepare(
      `INSERT INTO sales (
        id, inventory_id, effective_at, created_at, updated_at, status,
        total_amount_units, estimated_cost_units, estimated_profit_units, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      `sale-${suffix}`,
      `inventory-${suffix}`,
      TIMESTAMP,
      TIMESTAMP,
      TIMESTAMP,
      'CONFIRMED',
      4_000_000,
      2_000_000,
      2_000_000,
      null,
    );
  database
    .prepare(
      `INSERT INTO sale_items (
        id, sale_id, product_id, quantity, unit_sale_price_units,
        subtotal_units, unit_cost_snapshot_units, estimated_cost_units,
        estimated_profit_units, cost_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      `item-${suffix}`,
      `sale-${suffix}`,
      `product-${suffix}`,
      2,
      2_000_000,
      4_000_000,
      1_000_000,
      2_000_000,
      2_000_000,
      'KNOWN',
      TIMESTAMP,
      TIMESTAMP,
    );
  database
    .prepare(
      'INSERT INTO inventory_states (inventory_id, product_id, stock, unit_cost_units) VALUES (?, ?, ?, ?)',
    )
    .run(`inventory-${suffix}`, `product-${suffix}`, -1, 1_000_000);
  database
    .prepare(
      `INSERT INTO inventory_movements (
        id, inventory_id, product_id, type, quantity_delta,
        unit_cost_snapshot_units, stock_before, stock_after,
        source_type, source_id, metadata, effective_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      `movement-${suffix}`,
      `inventory-${suffix}`,
      `product-${suffix}`,
      'SALE',
      -2,
      1_000_000,
      1,
      -1,
      'SALE',
      `sale-${suffix}`,
      null,
      TIMESTAMP,
      TIMESTAMP,
      TIMESTAMP,
    );
}

function createRealSqliteHarness(database: DatabaseSync) {
  const drizzleDatabase = createNodeSqliteDrizzle(database);
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

  return new VoidSaleUseCase({
    inventoryMovementIdGenerator: { generate: () => 'reversal-real' },
    clock: { now: () => TIMESTAMP + 1 },
    transactionManager,
  });
}

test('real SQLite commits a void once and returns idempotently on retry', async () => {
  const database = openMigratedDatabase();

  try {
    seedVoidableSale(database, 'success');
    const useCase = createRealSqliteHarness(database);
    const first = await useCase.execute({
      inventoryId: 'inventory-success',
      saleId: 'sale-success',
    });
    const second = await useCase.execute({
      inventoryId: 'inventory-success',
      saleId: 'sale-success',
    });
    const persistedSale = database
      .prepare('SELECT status FROM sales WHERE id = ?')
      .get('sale-success') as { readonly status: string };
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
                stock_before, stock_after, unit_cost_snapshot_units
         FROM inventory_movements WHERE type = 'REVERSAL'`,
      )
      .all();
    const readDatabase = createNodeSqliteDrizzle(database);
    const readExecutor = readDatabase as unknown as Parameters<
      typeof createSqliteSalesSummaryReader
    >[0];
    const summary = await new GetSalesSummaryUseCase(
      createSqliteSalesSummaryReader(readExecutor),
    ).execute({
      inventoryId: 'inventory-success',
      fromInclusive: 0,
      toExclusive: Number.MAX_SAFE_INTEGER,
    });
    const history = await new ListHistoryUseCase(
      createSqliteHistoryReader(readExecutor),
    ).execute({ inventoryId: 'inventory-success', limit: 10 });
    const details = await new GetSaleDetailsUseCase(
      createSqliteSaleDetailsReader(readExecutor),
    ).execute({
      inventoryId: 'inventory-success',
      saleId: 'sale-success',
    });

    assert.equal(first.kind, 'VOIDED');
    assert.equal(second.kind, 'ALREADY_VOIDED');
    assert.equal(persistedSale.status, 'VOIDED');
    assert.equal(state.stock, 1);
    assert.equal(state.unit_cost_units, 1_000_000);
    assert.deepEqual(
      reversals.map((row) => ({ ...row })),
      [
        {
          type: 'REVERSAL',
          source_type: 'INVENTORY_MOVEMENT',
          source_id: 'movement-success',
          quantity_delta: 2,
          stock_before: -1,
          stock_after: 1,
          unit_cost_snapshot_units: 1_000_000,
        },
      ],
    );
    assert.equal(summary.totalAmount.equals(Money.zero()), true);
    assert.equal(summary.unitsSold, 0);
    assert.equal(summary.estimatedProfit?.equals(Money.zero()), true);
    assert.equal(history.length, 1);
    assert.equal(history[0]?.type, 'SALE');
    assert.equal(history[0]?.type === 'SALE' && history[0].status, 'VOIDED');
    assert.equal(details?.status, 'VOIDED');
    assert.equal(details?.items.length, 1);
    assert.equal(details?.items[0]?.unitCostSnapshot?.scaledUnits, 1_000_000);
  } finally {
    database.close();
  }
});

test('real SQLite rolls back reversals and stock when final Sale update fails', async () => {
  const database = openMigratedDatabase();

  try {
    seedVoidableSale(database, 'rollback');
    database.exec(`
      CREATE TRIGGER fail_void_sale
      BEFORE UPDATE ON sales
      WHEN OLD.id = 'sale-rollback'
      BEGIN
        SELECT RAISE(ABORT, 'controlled final failure');
      END;
    `);
    const useCase = createRealSqliteHarness(database);

    await assert.rejects(
      () =>
        useCase.execute({
          inventoryId: 'inventory-rollback',
          saleId: 'sale-rollback',
        }),
      /Failed query: update "sales"/,
    );

    const persistedSale = database
      .prepare('SELECT status FROM sales WHERE id = ?')
      .get('sale-rollback') as { readonly status: string };
    const persistedState = database
      .prepare(
        'SELECT stock, unit_cost_units FROM inventory_states WHERE product_id = ?',
      )
      .get('product-rollback') as {
      readonly stock: number;
      readonly unit_cost_units: number | null;
    };
    assert.equal(persistedSale.status, 'CONFIRMED');
    assert.equal(persistedState.stock, -1);
    assert.equal(persistedState.unit_cost_units, 1_000_000);
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

for (const failure of [
  {
    name: 'REVERSAL insert',
    trigger: `
      CREATE TRIGGER fail_reversal_insert
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
      CREATE TRIGGER fail_state_update
      BEFORE UPDATE ON inventory_states
      WHEN OLD.product_id = 'product-stage'
      BEGIN
        SELECT RAISE(ABORT, 'controlled state failure');
      END;
    `,
  },
] as const) {
  test(`real SQLite rolls back the complete void after ${failure.name} failure`, async () => {
    const database = openMigratedDatabase();

    try {
      seedVoidableSale(database, 'stage');
      database.exec(failure.trigger);
      const useCase = createRealSqliteHarness(database);

      await assert.rejects(
        () =>
          useCase.execute({
            inventoryId: 'inventory-stage',
            saleId: 'sale-stage',
          }),
        /Failed query/,
      );

      const persistedSale = database
        .prepare('SELECT status FROM sales WHERE id = ?')
        .get('sale-stage') as { readonly status: string };
      const persistedState = database
        .prepare('SELECT stock FROM inventory_states WHERE product_id = ?')
        .get('product-stage') as { readonly stock: number };
      const reversalCount = database
        .prepare(
          "SELECT count(*) AS count FROM inventory_movements WHERE type = 'REVERSAL'",
        )
        .get() as { readonly count: number };

      assert.equal(persistedSale.status, 'CONFIRMED');
      assert.equal(persistedState.stock, -1);
      assert.equal(reversalCount.count, 0);
    } finally {
      database.close();
    }
  });
}
