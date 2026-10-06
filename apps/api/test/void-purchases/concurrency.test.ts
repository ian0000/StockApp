import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CommandEnvelopeV1 } from '@stock-app/contracts';
import {
  createPostgresPool,
  createDatabase,
} from '../../src/infrastructure/postgres/client.js';
import {
  createCommandExecutor,
  type CommandTransaction,
} from '../../src/infrastructure/postgres/command-executor.js';
import { executeVoidPurchaseCommand } from '../../src/void-purchases/execute.js';
import { executeSaleCommand } from '../../src/sales/execute.js';
import { executePurchaseCommand } from '../../src/purchases/execute.js';
import { executeAdjustmentCommand } from '../../src/adjustments/execute.js';
import { executeProductCommand } from '../../src/products/execute.js';
import { saleCommand } from '../sales/helpers.js';
import { adjustmentCommand } from '../adjustments/helpers.js';
import { archiveCommand } from '../products/helpers.js';
import { barrier } from '../helpers/commands.js';
import { waitForInventoryLock } from '../commands/helpers.js';
import { voidPurchasesFixture } from './helpers.js';

for (const scenario of [
  'distinct',
  'same-operation',
  'sale-before',
  'purchase-before',
  'adjustment-before',
  'archive-before',
  'void-before-sale',
])
  test(`two pools serialize Purchase void with exact-state Cloud policy: ${scenario}`, async (t) => {
    let poolB: ReturnType<typeof createPostgresPool> | undefined;
    t.after(async () => {
      await poolB?.end();
    });
    const f = await voidPurchasesFixture(t),
      purchase = await f.purchase(),
      productId = purchase.payload.productId;
    await f.pool.query('UPDATE inventory_states SET state_revision=20');
    const aVoid = await f.command(purchase.payload.purchaseId),
      bVoid = await f.command(purchase.payload.purchaseId),
      saleCost = scenario === 'void-before-sale' ? '10000000' : '10666667',
      nextSale = saleCommand([
        {
          productId,
          quantity: 1,
          price: '15000000',
          cost: saleCost,
          estimatedCost: saleCost,
          estimatedProfit:
            scenario === 'void-before-sale' ? '5000000' : '4333333',
        },
      ]),
      nextPurchase = await f.purchaseCommand(productId, 1, '12000000'),
      adjustment = adjustmentCommand(
        productId,
        31,
        'USE_CURRENT_COST',
        null,
        aVoid.preconditions,
      );
    nextSale.occurredAt =
      nextPurchase.occurredAt =
      adjustment.occurredAt =
        1100;
    nextSale.payload.createdAt =
      nextPurchase.payload.createdAt =
      adjustment.payload.createdAt =
        1200;
    const a =
        scenario === 'sale-before'
          ? nextSale
          : scenario === 'purchase-before'
            ? nextPurchase
            : scenario === 'adjustment-before'
              ? adjustment
              : scenario === 'archive-before'
                ? archiveCommand(productId)
                : aVoid,
      b =
        scenario === 'same-operation'
          ? aVoid
          : scenario === 'void-before-sale'
            ? nextSale
            : bVoid;
    assert.ok(f.pool.options.connectionString);
    poolB = createPostgresPool(f.pool.options.connectionString);
    const executeB = createCommandExecutor(createDatabase(poolB), () => 2000),
      entered = barrier(),
      release = barrier();
    let calls = 0;
    const callback =
      (command: CommandEnvelopeV1) =>
      async (tx: CommandTransaction, inventory: { id: string }) => {
        calls++;
        if (command.commandKind === 'PURCHASE_VOID')
          return executeVoidPurchaseCommand(
            tx,
            inventory.id,
            command,
            () => 2000,
          );
        if (command.commandKind === 'SALE_REGISTER')
          return executeSaleCommand(tx, inventory.id, command);
        if (command.commandKind === 'PURCHASE_REGISTER')
          return executePurchaseCommand(tx, inventory.id, command);
        if (command.commandKind === 'STOCK_ADJUST')
          return executeAdjustmentCommand(tx, inventory.id, command);
        if (command.commandKind === 'PRODUCT_ARCHIVE')
          return executeProductCommand(tx, inventory.id, command, () => 2000);
        throw new Error('Unexpected fixture command.');
      };
    const before = await f.counts(f.context),
      first = f.execute(
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
    const [rA, rB] = await done,
      conflict = [
        'distinct',
        'sale-before',
        'purchase-before',
        'adjustment-before',
      ].includes(scenario);
    assert.equal(rA.status, 'ACCEPTED');
    assert.equal(rB.status, conflict ? 'CONFLICT' : 'ACCEPTED');
    if (conflict) {
      assert.ok('error' in rB);
      assert.equal(rB.error.code, 'REVISION_CONFLICT');
      assert.deepEqual(await executeB(f.input(f.context, b, callback(b))), rB);
    }
    if (scenario === 'same-operation') {
      assert.deepEqual(rA, rB);
      assert.equal(calls, 1);
    } else assert.equal(calls, 2);
    const actuallyVoided = ![
        'sale-before',
        'purchase-before',
        'adjustment-before',
      ].includes(scenario),
      state = (await f.pool.query('SELECT * FROM inventory_states')).rows[0];
    assert.equal(
      (
        await f.pool.query('SELECT status FROM purchases WHERE id=$1', [
          purchase.payload.purchaseId,
        ])
      ).rows[0].status,
      actuallyVoided ? 'VOIDED' : 'CONFIRMED',
    );
    assert.equal(
      (
        await f.pool.query(
          "SELECT count(*) FROM inventory_movements WHERE type='REVERSAL'",
        )
      ).rows[0].count,
      actuallyVoided ? '1' : '0',
    );
    assert.equal(
      state.state_revision,
      scenario === 'void-before-sale' ? '22' : '21',
    );
    assert.equal(
      state.stock,
      actuallyVoided
        ? scenario === 'void-before-sale'
          ? '19'
          : '20'
        : scenario === 'sale-before'
          ? '29'
          : '31',
    );
    assert.equal(
      state.unit_cost_units,
      actuallyVoided
        ? '10000000'
        : scenario === 'purchase-before'
          ? '10709678'
          : '10666667',
    );
    const after = await f.counts(f.context),
      increments = ['archive-before', 'void-before-sale'].includes(scenario)
        ? 2n
        : 1n;
    assert.equal(BigInt(after.revision), BigInt(before.revision) + increments);
    assert.equal(BigInt(after.changes), BigInt(before.changes) + increments);
    assert.equal(
      BigInt(after.receipts),
      BigInt(before.receipts) + (scenario === 'same-operation' ? 1n : 2n),
    );
  });
