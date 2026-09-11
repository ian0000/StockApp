import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import test from 'node:test';
import { URL } from 'node:url';
import { drizzle } from 'drizzle-orm/expo-sqlite/driver';

import {
  RegisterPurchaseUseCase,
  UpdateProductUseCase,
  type TransactionManager,
} from '@stock-app/application';
import { Money, Percentage } from '@stock-app/domain';
import {
  createSqliteProductRepository,
  createSqliteTransactionRepositories,
} from '../src/infrastructure/sqlite/repositories/repositories';
import { applySuggestedPrice } from '../src/ui/purchases/purchase-price-presentation';
import { createPurchaseMarginPresentation } from '../src/ui/purchases/purchase-margin-input';

async function setup() {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON');
  for (const file of [
    '0000_cool_purple_man.sql',
    '0001_confused_naoko.sql',
    '0002_absent_goblin_queen.sql',
    '0003_sparkling_nuke.sql',
  ]) {
    database.exec(
      readFileSync(
        new URL(`../drizzle/${file}`, import.meta.url),
        'utf8',
      ).replaceAll('--> statement-breakpoint', ''),
    );
  }
  database.exec(`
    INSERT INTO inventories (id, name, currency, created_at, updated_at) VALUES ('inv', 'Test', 'USD', 1, 1);
    INSERT INTO products (id, inventory_id, name, regular_sale_price_units, is_archived, created_at, updated_at) VALUES ('product', 'inv', 'Coffee', 10000000, 0, 1, 1);
    INSERT INTO inventory_states (inventory_id, product_id, stock, unit_cost_units) VALUES ('inv', 'product', 0, 7000000);
  `);
  // Implement the synchronous statement surface consumed by Drizzle's Expo driver on real Node SQLite.
  const client = {
    prepareSync(sql: string) {
      const statement = database.prepare(sql);
      return {
        executeSync(params: SQLInputValue[]) {
          const result = statement.run(...params);
          return {
            changes: Number(result.changes),
            lastInsertRowId: Number(result.lastInsertRowid),
          };
        },
        executeForRawResultSync(params: SQLInputValue[]) {
          return {
            getAllSync: () =>
              statement.all(...params).map((row) => Object.values(row)),
          };
        },
      };
    },
  };
  const adapterExecutor = drizzle(
    client as unknown as Parameters<typeof drizzle>[0],
  );
  const repositories = createSqliteTransactionRepositories(adapterExecutor);
  const transactionManager: TransactionManager = {
    async runInTransaction(operation) {
      database.exec('BEGIN IMMEDIATE');
      try {
        const value = await operation(repositories);
        database.exec('COMMIT');
        return value;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
  };
  let purchaseCalls = 0;
  const result = await new RegisterPurchaseUseCase({
    transactionManager,
    clock: { now: () => 100 },
    purchaseIdGenerator: { generate: () => `purchase-${++purchaseCalls}` },
    inventoryMovementIdGenerator: { generate: () => 'movement' },
  }).execute({
    inventoryId: 'inv',
    productId: 'product',
    quantity: 10,
    unitCost: Money.fromDecimal('8'),
  });
  const updater = new UpdateProductUseCase({
    clock: { now: () => 101 },
    productRepository: createSqliteProductRepository(adapterExecutor),
  });
  const snapshot = () =>
    JSON.stringify(
      [
        'purchases',
        'inventory_movements',
        'inventory_states',
        'sales',
        'sale_items',
        'stock_adjustments',
      ].map((table) => database.prepare(`SELECT * FROM ${table}`).all()),
    );
  const price = () =>
    database.prepare('SELECT regular_sale_price_units FROM products').get()
      ?.regular_sale_price_units;
  const writes = () =>
    database.prepare('SELECT total_changes() AS count').get()?.count;
  return {
    database,
    result,
    updater,
    snapshot,
    price,
    writes,
    purchaseCalls: () => purchaseCalls,
  };
}

test('real purchase remains single and intact while editing and accepting the exact suggested Money', async () => {
  const h = await setup();
  try {
    const before = h.snapshot();
    const writes = h.writes();
    for (const text of ['30', '35', '0', '40', '30'])
      createPurchaseMarginPresentation(h.result, text, 'USD');
    assert.equal(h.writes(), writes);
    assert.equal(h.price(), 10_000_000);
    await applySuggestedPrice(
      h.result,
      h.updater,
      Percentage.fromDecimal('30'),
    );
    assert.equal(h.price(), 11_428_571);
    assert.equal(h.snapshot(), before);
    assert.equal(h.purchaseCalls(), 1);
  } finally {
    h.database.close();
  }
});

test('keeping the price and insufficient/equal target prices perform no SQLite write', async () => {
  const h = await setup();
  try {
    const before = h.snapshot();
    const writes = h.writes();
    for (const text of ['0', '20']) {
      const margin = Percentage.fromDecimal(text);
      assert.equal(
        createPurchaseMarginPresentation(h.result, text, 'USD').recommendation
          .status,
        'CURRENT_PRICE_ALREADY_SUFFICIENT',
      );
      await assert.rejects(
        () => applySuggestedPrice(h.result, h.updater, margin),
        /No suggested/,
      );
    }
    assert.equal(h.writes(), writes);
    assert.equal(h.price(), 10_000_000);
    assert.equal(h.snapshot(), before);
    assert.equal(h.purchaseCalls(), 1);
  } finally {
    h.database.close();
  }
});

test('a real SQLite Product update failure retries only the price, never the Purchase', async () => {
  const h = await setup();
  try {
    const before = h.snapshot();
    h.database.exec(
      "CREATE TRIGGER reject_price BEFORE UPDATE ON products BEGIN SELECT RAISE(ABORT, 'controlled failure'); END;",
    );
    const margin = Percentage.fromDecimal('35');
    await assert.rejects(() =>
      applySuggestedPrice(h.result, h.updater, margin),
    );
    assert.equal(h.price(), 10_000_000);
    assert.equal(h.snapshot(), before);
    h.database.exec('DROP TRIGGER reject_price');
    await applySuggestedPrice(h.result, h.updater, margin);
    assert.equal(h.price(), 12_307_692);
    assert.equal(h.snapshot(), before);
    assert.equal(h.purchaseCalls(), 1);
  } finally {
    h.database.close();
  }
});
