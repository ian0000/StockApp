import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createPostgresPool,
  createDatabase,
} from '../../src/infrastructure/postgres/client.js';
import { createCommandExecutor } from '../../src/infrastructure/postgres/command-executor.js';
import { executeAdjustmentCommand } from '../../src/adjustments/execute.js';
import { executePurchaseCommand } from '../../src/purchases/execute.js';
import { executeSaleCommand } from '../../src/sales/execute.js';
import { executeProductCommand } from '../../src/products/execute.js';
import { updateCommand, archiveCommand } from '../products/helpers.js';
import { saleCommand } from '../sales/helpers.js';
import { barrier } from '../helpers/commands.js';
import { waitForInventoryLock } from '../commands/helpers.js';
import { adjustmentsFixture } from './helpers.js';

for (const scenario of [
  'two-adjustments',
  'same-operation',
  'sale-before',
  'purchase-before',
  'metadata',
  'archive-before',
  'archive-after',
])
  test(`two pools serialize adjustment: ${scenario}`, async (t) => {
    let poolB: ReturnType<typeof createPostgresPool> | undefined;
    t.after(async () => {
      await poolB?.end();
    });
    const f = await adjustmentsFixture(t),
      productId = await f.product();
    await f.pool.query(
      'UPDATE inventory_states SET state_revision=5 WHERE product_id=$1',
      [productId],
    );
    const adjustment = await f.command(productId, 30),
      other = await f.command(productId, 25),
      purchase = await f.purchaseCommand(productId),
      sale = saleCommand([
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
        : scenario === 'purchase-before'
          ? purchase
          : scenario === 'metadata'
            ? updateCommand(productId, '0', { regularSalePrice: '20000000' })
            : scenario === 'archive-before'
              ? archiveCommand(productId)
              : adjustment;
    const b =
      scenario === 'same-operation'
        ? adjustment
        : scenario === 'archive-after'
          ? archiveCommand(productId)
          : other;
    assert.ok(f.pool.options.connectionString);
    poolB = createPostgresPool(f.pool.options.connectionString);
    const executeB = createCommandExecutor(createDatabase(poolB), () => 2000),
      entered = barrier(),
      release = barrier();
    let calls = 0;
    const callback =
      (command: typeof a | typeof b) =>
      async (
        tx: Parameters<typeof executeAdjustmentCommand>[0],
        inventory: { id: string },
      ) => {
        calls++;
        return command.commandKind === 'STOCK_ADJUST'
          ? executeAdjustmentCommand(tx, inventory.id, command)
          : command.commandKind === 'PURCHASE_REGISTER'
            ? executePurchaseCommand(tx, inventory.id, command)
            : command.commandKind === 'SALE_REGISTER'
              ? executeSaleCommand(tx, inventory.id, command)
              : executeProductCommand(tx, inventory.id, command, () => 2000);
      };
    const first = f.execute(
      f.input(f.context, a, async (tx, inventory) => {
        entered.release();
        await release.wait;
        return callback(a)(tx, inventory);
      }),
    );
    await entered.wait;
    const second = executeB(f.input(f.context, b, callback(b))),
      done = Promise.all([first, second]);
    try {
      await waitForInventoryLock(f.pool);
    } finally {
      release.release();
    }
    const [rA, rB] = await done;
    assert.equal(rA.status, 'ACCEPTED');
    if (
      ['two-adjustments', 'sale-before', 'purchase-before'].includes(scenario)
    ) {
      assert.equal(rB.status, 'CONFLICT');
      assert.ok('error' in rB);
      assert.equal(rB.error.code, 'REVISION_CONFLICT');
      assert.deepEqual(rB.error.details, { currentRevision: '6' });
    } else if (scenario === 'archive-before') {
      assert.equal(rB.status, 'REJECTED');
      assert.ok('error' in rB);
      assert.equal(rB.error.code, 'NOT_FOUND');
    } else assert.equal(rB.status, 'ACCEPTED');
    if (scenario === 'same-operation') {
      assert.deepEqual(rA, rB);
      assert.equal(calls, 1);
    } else assert.equal(calls, 2);
    const state = (await f.pool.query('SELECT * FROM inventory_states'))
      .rows[0];
    assert.equal(
      state.stock,
      scenario === 'sale-before'
        ? '19'
        : scenario === 'archive-before'
          ? '20'
          : scenario === 'metadata'
            ? '25'
            : '30',
    );
    assert.equal(
      state.state_revision,
      scenario === 'archive-before' ? '5' : '6',
    );
    assert.equal(
      state.unit_cost_units,
      ['sale-before', 'archive-before'].includes(scenario)
        ? '10000000'
        : scenario === 'metadata'
          ? '10400000'
          : '10666667',
    );
    assert.equal(
      (await f.pool.query('SELECT count(*) FROM stock_adjustments')).rows[0]
        .count,
      ['sale-before', 'purchase-before', 'archive-before'].includes(scenario)
        ? '0'
        : '1',
    );
    assert.equal(
      (await f.counts(f.context)).revision,
      ['metadata', 'archive-after'].includes(scenario) ? '3' : '2',
    );
  });
