import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createPostgresPool,
  createDatabase,
} from '../../src/infrastructure/postgres/client.js';
import { createCommandExecutor } from '../../src/infrastructure/postgres/command-executor.js';
import { executePurchaseCommand } from '../../src/purchases/execute.js';
import { executeProductCommand } from '../../src/products/execute.js';
import { executeSaleCommand } from '../../src/sales/execute.js';
import { reconstructPurchaseResult } from '../../src/purchases/results.js';
import { updateCommand, archiveCommand } from '../products/helpers.js';
import { saleCommand } from '../sales/helpers.js';
import { barrier } from '../helpers/commands.js';
import { waitForInventoryLock } from '../commands/helpers.js';
import { purchasesFixture } from './helpers.js';

for (const scenario of [
  'two-purchases',
  'same-operation',
  'sale-before',
  'metadata',
  'archive-before',
  'archive-after',
  'purchase-before-sale',
])
  test(`two PostgreSQL pools enforce Purchase policy: ${scenario}`, async (t) => {
    let poolB: ReturnType<typeof createPostgresPool> | undefined;
    t.after(async () => {
      await poolB?.end();
    });
    const f = await purchasesFixture(t),
      productId = await f.product();
    await f.pool.query(
      'UPDATE inventory_states SET state_revision=5 WHERE product_id=$1',
      [productId],
    );
    const aPurchase = await f.command(productId, 10, '12000000'),
      bPurchase = await f.command(productId, 5, '11000000');
    const sale = saleCommand([
      {
        productId,
        quantity: 1,
        price: '15000000',
        cost: '10000000',
        estimatedCost: '10000000',
        estimatedProfit: '5000000',
      },
    ]);
    const a =
      scenario === 'sale-before'
        ? sale
        : scenario === 'metadata'
          ? updateCommand(productId, '0', { regularSalePrice: '20000000' })
          : scenario === 'archive-before'
            ? archiveCommand(productId)
            : aPurchase;
    const b =
      scenario === 'same-operation'
        ? aPurchase
        : scenario === 'archive-after'
          ? archiveCommand(productId)
          : scenario === 'purchase-before-sale'
            ? sale
            : bPurchase;
    assert.ok(f.pool.options.connectionString);
    poolB = createPostgresPool(f.pool.options.connectionString);
    const executeB = createCommandExecutor(createDatabase(poolB), () => 2000),
      entered = barrier(),
      release = barrier();
    let calls = 0;
    const first = f.execute(
      f.input(f.context, a, async (tx, inventory) => {
        calls++;
        entered.release();
        await release.wait;
        return a.commandKind === 'PURCHASE_REGISTER'
          ? executePurchaseCommand(tx, inventory.id, a)
          : a.commandKind === 'SALE_REGISTER'
            ? executeSaleCommand(tx, inventory.id, a)
            : executeProductCommand(tx, inventory.id, a, () => 2000);
      }),
    );
    await entered.wait;
    const second = executeB(
      f.input(f.context, b, async (tx, inventory) => {
        calls++;
        return b.commandKind === 'PURCHASE_REGISTER'
          ? executePurchaseCommand(tx, inventory.id, b)
          : b.commandKind === 'SALE_REGISTER'
            ? executeSaleCommand(tx, inventory.id, b)
            : executeProductCommand(tx, inventory.id, b, () => 2000);
      }),
    );
    const done = Promise.all([first, second]);
    try {
      await waitForInventoryLock(f.pool);
    } finally {
      release.release();
    }
    const [rA, rB] = await done;
    assert.equal(rA.status, 'ACCEPTED');
    if (scenario === 'two-purchases' || scenario === 'sale-before') {
      assert.equal(rB.status, 'CONFLICT');
      assert.ok('error' in rB);
      assert.equal(rB.error.code, 'REVISION_CONFLICT');
      assert.deepEqual(rB.error.details, { currentRevision: '6' });
    } else if (scenario === 'archive-before') {
      assert.equal(rB.status, 'REJECTED');
      assert.ok('error' in rB);
      assert.equal(rB.error.code, 'NOT_FOUND');
    } else if (scenario === 'purchase-before-sale') {
      assert.equal(rB.status, 'CONFLICT');
      assert.ok('error' in rB);
      assert.equal(rB.error.code, 'COST_SNAPSHOT_CONFLICT');
    } else assert.equal(rB.status, 'ACCEPTED');
    if (scenario === 'same-operation') {
      assert.deepEqual(rA, rB);
      assert.equal(calls, 1);
    } else assert.equal(calls, 2);
    const state = (await f.pool.query('SELECT * FROM inventory_states'))
      .rows[0];
    const expectedStock =
      scenario === 'sale-before'
        ? '19'
        : scenario === 'archive-before'
          ? '20'
          : scenario === 'metadata'
            ? '25'
            : '30';
    assert.equal(state.stock, expectedStock);
    assert.equal(
      state.state_revision,
      scenario === 'archive-before' ? '5' : '6',
    );
    assert.equal(
      state.unit_cost_units,
      scenario === 'sale-before' || scenario === 'archive-before'
        ? '10000000'
        : scenario === 'metadata'
          ? '10200000'
          : '10666667',
    );
    assert.equal(
      (await f.pool.query('SELECT count(*) FROM purchases')).rows[0].count,
      scenario === 'sale-before' || scenario === 'archive-before' ? '0' : '1',
    );
    assert.equal(
      (
        await f.pool.query(
          "SELECT count(*) FROM inventory_movements WHERE type='PURCHASE'",
        )
      ).rows[0].count,
      scenario === 'sale-before' || scenario === 'archive-before' ? '0' : '1',
    );
    assert.equal(
      (await f.counts(f.context)).revision,
      scenario === 'metadata' || scenario === 'archive-after' ? '3' : '2',
    );
    if (scenario === 'metadata') {
      const result = reconstructPurchaseResult(rB, bPurchase);
      assert.equal(result.product.metadataRevision, '1');
      assert.equal(result.product.regularSalePrice, '20000000');
      assert.equal(result.priceAnalysis.regularSalePrice, '20000000');
    }
  });
