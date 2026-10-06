import assert from 'node:assert/strict';
import { test } from 'node:test';
import { saleCommand, salesFixture } from './helpers.js';
import { reconstructSaleResult } from '../../src/sales/results.js';

test('mixed unknown sale does not sum known costs into an unavailable aggregate, even beyond safe total cost range', async (t) => {
  const f = await salesFixture(t),
    a = await f.product(1, '6000000000000000'),
    b = await f.product(1, '6000000000000000'),
    c = await f.product(0, null);
  const command = saleCommand([
    ...[a, b].map((productId) => ({
      productId,
      quantity: 1,
      price: '1',
      cost: '6000000000000000',
      estimatedCost: '6000000000000000',
      estimatedProfit: '-5999999999999999',
    })),
    {
      productId: c,
      quantity: 1,
      price: '1',
      cost: null,
      estimatedCost: null,
      estimatedProfit: null,
    },
  ]);
  const receipt = await f.run(command);
  assert.equal(receipt.status, 'ACCEPTED');
  const result = reconstructSaleResult(receipt, command);
  assert.equal(result.sale.totalAmount, '3');
  assert.equal(result.sale.estimatedCost, null);
  assert.equal(result.sale.estimatedProfit, null);
});

for (const [stock, cost, expectedStock, expectedCost, expectedProfit] of [
  [5, '5000000', 2, '15000000', '6000000'],
  [3, '5000000', 0, '15000000', '6000000'],
  [1, '5000000', -2, '15000000', '6000000'],
  [-2, '5000000', -5, '15000000', '6000000'],
  [0, null, -3, null, null],
  [-2, null, -5, null, null],
  [5, '0', 2, '0', '21000000'],
  [5, '8000000', 2, '24000000', '-3000000'],
] as const)
  test(`Sale uses canonical cost ${cost}, stock ${stock}→${expectedStock}, profit ${expectedProfit}`, async (t) => {
    const f = await salesFixture(t),
      productId = await f.product(stock, cost);
    const command = saleCommand([
      {
        productId,
        quantity: 3,
        price: '7000000',
        cost,
        estimatedCost: expectedCost,
        estimatedProfit: expectedProfit,
      },
    ]);
    const receipt = await f.run(command);
    assert.equal(receipt.status, 'ACCEPTED');
    const sale = (await f.pool.query('SELECT * FROM sales')).rows[0],
      item = (await f.pool.query('SELECT * FROM sale_items')).rows[0];
    assert.equal(sale.total_amount_units, '21000000');
    assert.equal(sale.estimated_cost_units, expectedCost);
    assert.equal(sale.estimated_profit_units, expectedProfit);
    assert.equal(item.cost_status, cost === null ? 'UNKNOWN' : 'KNOWN');
    assert.equal(item.unit_cost_snapshot_units, cost);
    const state = (await f.pool.query('SELECT * FROM inventory_states'))
      .rows[0];
    assert.equal(state.stock, String(expectedStock));
    assert.equal(state.unit_cost_units, cost);
    assert.equal(state.state_revision, '1');
    assert.equal(state.last_movement_id, command.payload.items[0].movementId);
    const movement = (
      await f.pool.query("SELECT * FROM inventory_movements WHERE type='SALE'")
    ).rows[0];
    assert.equal(movement.stock_before, String(stock));
    assert.equal(movement.stock_after, String(expectedStock));
    assert.equal(movement.quantity_delta, '-3');
    assert.equal(movement.source_id, command.payload.saleId);
    assert.equal(movement.effective_at, '123');
    assert.equal(movement.created_at, '456');
  });

for (const mode of ['known', 'mixed', 'unknown'])
  test(`multiproduct Sale exact totals and ${mode} aggregate snapshots`, async (t) => {
    const f = await salesFixture(t),
      a = await f.product(
        mode === 'unknown' ? 0 : 10,
        mode === 'unknown' ? null : '5000000',
      ),
      b = await f.product(
        mode === 'known' ? 10 : 0,
        mode === 'known' ? '0' : null,
      );
    const command = saleCommand(
      [
        {
          productId: a,
          quantity: 2,
          price: '7000000',
          cost: mode === 'unknown' ? null : '5000000',
          estimatedCost: mode === 'unknown' ? null : '10000000',
          estimatedProfit: mode === 'unknown' ? null : '4000000',
        },
        {
          productId: b,
          quantity: 1,
          price: '10666667',
          cost: mode === 'known' ? '0' : null,
          estimatedCost: mode === 'known' ? '0' : null,
          estimatedProfit: mode === 'known' ? '10666667' : null,
        },
      ],
      '  Fictional notes  ',
    );
    const receipt = await f.run(command);
    assert.equal(receipt.status, 'ACCEPTED');
    assert.ok('changeSet' in receipt);
    const upserts = receipt.changeSet.upserts;
    assert.equal(upserts.sales[0].totalAmount, '24666667');
    assert.equal(
      upserts.sales[0].estimatedCost,
      mode === 'known' ? '10000000' : null,
    );
    assert.equal(
      upserts.sales[0].estimatedProfit,
      mode === 'known' ? '14666667' : null,
    );
    assert.equal(upserts.sales[0].notes, 'Fictional notes');
    assert.deepEqual(
      upserts.saleItems.map((i) => i.id),
      command.payload.items.map((i) => i.saleItemId),
    );
    assert.deepEqual(
      upserts.inventoryMovements.map((i) => i.id),
      command.payload.items.map((i) => i.movementId),
    );
    assert.deepEqual(
      upserts.inventoryStates.map((s) => s.productId),
      [a, b],
    );
    assert.equal(upserts.products.length, 0);
    assert.equal(upserts.purchases.length, 0);
    assert.equal(upserts.stockAdjustments.length, 0);
    assert.deepEqual(receipt.changeSet.tombstones, []);
  });
