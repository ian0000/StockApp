import assert from 'node:assert/strict';
import { test } from 'node:test';
import { saleCommand, salesFixture } from './helpers.js';
import { reconstructSaleResult } from '../../src/sales/results.js';
import { id } from '../postgres/helpers.js';

for (const corruption of [
  'missing-sale',
  'missing-item',
  'duplicate-item',
  'missing-movement',
  'missing-state',
  'wrong-product',
  'wrong-quantity',
  'wrong-price',
  'wrong-source',
  'wrong-state-movement',
  'wrong-state-stock',
  'wrong-state-cost',
  'wrong-subtotal',
  'wrong-aggregate',
  'unknown-zero',
])
  test(`durable Sale response rejects ${corruption} without repeating stock delta`, async (t) => {
    const f = await salesFixture(t),
      a = await f.product(),
      b = await f.product(0, null);
    const command = saleCommand([
      {
        productId: a,
        quantity: 1,
        price: '7000000',
        cost: '5000000',
        estimatedCost: '5000000',
        estimatedProfit: '2000000',
      },
      {
        productId: b,
        quantity: 1,
        price: '7000000',
        cost: null,
        estimatedCost: null,
        estimatedProfit: null,
      },
    ]);
    const accepted = await f.run(command);
    assert.ok('changeSet' in accepted);
    const revision = accepted.changeSet.revision;
    const changes = (
        await f.pool.query(
          'SELECT changes FROM inventory_change_sets WHERE inventory_id=$1 AND revision=$2',
          [f.context.inventory.id, revision],
        )
      ).rows[0].changes,
      up = changes.upserts;
    switch (corruption) {
      case 'missing-sale':
        up.sales = [];
        break;
      case 'missing-item':
        up.saleItems.pop();
        break;
      case 'duplicate-item':
        up.saleItems[1] = up.saleItems[0];
        break;
      case 'missing-movement':
        up.inventoryMovements.pop();
        break;
      case 'missing-state':
        up.inventoryStates.pop();
        break;
      case 'wrong-product':
        up.saleItems[0].productId = id();
        break;
      case 'wrong-quantity':
        up.saleItems[0].quantity = 2;
        break;
      case 'wrong-price':
        up.saleItems[0].unitSalePrice = '1';
        break;
      case 'wrong-source':
        up.inventoryMovements[0].sourceId = id();
        break;
      case 'wrong-state-movement':
        up.inventoryStates[0].lastMovementId = id();
        break;
      case 'wrong-state-stock':
        up.inventoryStates[0].stock = 8;
        break;
      case 'wrong-state-cost':
        up.inventoryStates[0].unitCost = '1';
        break;
      case 'wrong-subtotal':
        up.saleItems[0].subtotal = '1';
        break;
      case 'wrong-aggregate':
        up.sales[0].totalAmount = '1';
        break;
      case 'unknown-zero':
        up.saleItems[1].unitCostSnapshot = '0';
        break;
    }
    const state = (
      await f.pool.query('SELECT * FROM inventory_states ORDER BY product_id')
    ).rows;
    await f.pool.query(
      'UPDATE inventory_change_sets SET changes=$1 WHERE inventory_id=$2 AND revision=$3',
      [changes, f.context.inventory.id, revision],
    );
    await assert.rejects(async () =>
      reconstructSaleResult(await f.run(command), command),
    );
    assert.deepEqual(
      (await f.pool.query('SELECT * FROM inventory_states ORDER BY product_id'))
        .rows,
      state,
    );
    assert.equal(
      (await f.pool.query('SELECT count(*) FROM sales')).rows[0].count,
      '1',
    );
    assert.equal((await f.counts(f.context)).revision, revision);
  });

test('reconstruction matches explicit identities and restores command line order even if durable arrays are reordered', async (t) => {
  const f = await salesFixture(t),
    a = await f.product(),
    b = await f.product();
  const command = saleCommand(
      [a, b].map((productId) => ({
        productId,
        quantity: 1,
        price: '7000000',
        cost: '5000000',
        estimatedCost: '5000000',
        estimatedProfit: '2000000',
      })),
    ),
    receipt = await f.run(command);
  assert.ok('changeSet' in receipt);
  const original = reconstructSaleResult(receipt, command);
  receipt.changeSet.upserts.saleItems.reverse();
  receipt.changeSet.upserts.inventoryMovements.reverse();
  receipt.changeSet.upserts.inventoryStates.reverse();
  assert.deepEqual(reconstructSaleResult(receipt, command), original);
});
