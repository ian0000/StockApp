import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eq } from 'drizzle-orm';
import {
  createPostgresPool,
  createDatabase,
} from '../../src/infrastructure/postgres/client.js';
import { createCommandExecutor } from '../../src/infrastructure/postgres/command-executor.js';
import { executeSaleCommand } from '../../src/sales/execute.js';
import { executeProductCommand } from '../../src/products/execute.js';
import { updateCommand, archiveCommand } from '../products/helpers.js';
import { barrier } from '../helpers/commands.js';
import { waitForInventoryLock } from '../commands/helpers.js';
import { saleCommand, salesFixture } from './helpers.js';
import {
  inventories,
  inventoryStates,
} from '../../src/infrastructure/postgres/schema.js';

for (const scenario of [
  'same-cost',
  'same-operation',
  'metadata',
  'archive-before',
  'archive-after',
])
  test(`two PostgreSQL pools serialize ${scenario} without incorrect cost/stock conflicts`, async (t) => {
    let poolB: ReturnType<typeof createPostgresPool> | undefined;
    t.after(async () => {
      await poolB?.end();
    });
    const f = await salesFixture(t),
      productId = await f.product();
    assert.ok(f.pool.options.connectionString);
    poolB = createPostgresPool(f.pool.options.connectionString);
    const executeB = createCommandExecutor(createDatabase(poolB), () => 2000);
    const aSale = saleCommand([
        {
          productId,
          quantity: 2,
          price: '7000000',
          cost: '5000000',
          estimatedCost: '10000000',
          estimatedProfit: '4000000',
        },
      ]),
      bSale = saleCommand([
        {
          productId,
          quantity: 3,
          price: '7000000',
          cost: '5000000',
          estimatedCost: '15000000',
          estimatedProfit: '6000000',
        },
      ]);
    const a =
        scenario === 'metadata'
          ? updateCommand(productId)
          : scenario === 'archive-before'
            ? archiveCommand(productId)
            : aSale,
      b =
        scenario === 'same-operation'
          ? aSale
          : scenario === 'archive-after'
            ? archiveCommand(productId)
            : bSale;
    const entered = barrier(),
      release = barrier();
    let calls = 0;
    const first = f.execute(
      f.input(f.context, a, async (tx, inventory) => {
        calls++;
        entered.release();
        await release.wait;
        return a.commandKind === 'SALE_REGISTER'
          ? executeSaleCommand(tx, inventory.id, a)
          : executeProductCommand(tx, inventory.id, a, () => 2000);
      }),
    );
    await entered.wait;
    const second = executeB(
      f.input(f.context, b, async (tx, inventory) => {
        calls++;
        return b.commandKind === 'SALE_REGISTER'
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
    assert.equal(
      rB.status,
      scenario === 'archive-before' ? 'REJECTED' : 'ACCEPTED',
    );
    if (scenario === 'same-operation') {
      assert.deepEqual(rA, rB);
      assert.equal(calls, 1);
    } else assert.equal(calls, 2);
    const state = (await f.pool.query('SELECT * FROM inventory_states'))
      .rows[0];
    assert.equal(
      state.stock,
      scenario === 'same-cost'
        ? '5'
        : scenario === 'metadata'
          ? '7'
          : scenario === 'archive-before'
            ? '10'
            : '8',
    );
    assert.equal(state.unit_cost_units, '5000000');
    assert.equal(
      state.state_revision,
      scenario === 'same-cost'
        ? '2'
        : scenario === 'archive-before'
          ? '0'
          : '1',
    );
    assert.equal(
      (await f.pool.query('SELECT count(*) FROM sales')).rows[0].count,
      scenario === 'same-cost'
        ? '2'
        : scenario === 'archive-before'
          ? '0'
          : '1',
    );
    if (scenario === 'same-cost') {
      assert.ok('changeSet' in rA && 'changeSet' in rB);
      assert.equal(rA.changeSet.revision, '2');
      assert.equal(rB.changeSet.revision, '3');
      assert.equal(rB.changeSet.upserts.inventoryMovements[0].stockBefore, 8);
      assert.equal(rB.changeSet.upserts.inventoryMovements[0].stockAfter, 5);
    }
    if (scenario === 'metadata' && 'changeSet' in rB)
      assert.equal(rB.changeSet.upserts.saleItems[0].unitSalePrice, '7000000');
  });

test('controlled cost writer holding Inventory lock causes waiting Sale cost conflict, without public Purchase/debug endpoint', async (t) => {
  const f = await salesFixture(t),
    productId = await f.product(),
    entered = barrier(),
    release = barrier();
  const fixture = f.db.transaction(async (tx) => {
    await tx
      .select()
      .from(inventories)
      .where(eq(inventories.id, f.context.inventory.id))
      .for('update');
    entered.release();
    await release.wait;
    await tx
      .update(inventoryStates)
      .set({ unitCostUnits: 6000000n, stateRevision: 1n })
      .where(eq(inventoryStates.productId, productId));
  });
  await entered.wait;
  const pending = f.run(
    saleCommand([
      {
        productId,
        quantity: 1,
        price: '7000000',
        cost: '5000000',
        estimatedCost: '5000000',
        estimatedProfit: '2000000',
      },
    ]),
  );
  const done = Promise.all([fixture, pending]);
  try {
    await waitForInventoryLock(f.pool);
  } finally {
    release.release();
  }
  const [, result] = await done;
  assert.equal(result.status, 'CONFLICT');
  assert.ok('error' in result);
  assert.equal(result.error.code, 'COST_SNAPSHOT_CONFLICT');
  assert.equal(
    (await f.pool.query('SELECT count(*) FROM sales')).rows[0].count,
    '0',
  );
  assert.equal((await f.counts(f.context)).revision, '1');
});
