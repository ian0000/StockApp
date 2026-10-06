import assert from 'node:assert/strict';
import { test } from 'node:test';
import { saleCommand, salesFixture } from './helpers.js';
import { reconstructSaleResult } from '../../src/sales/results.js';

for (const notes of [null, '', '   ', '  Fictional\ninternal notes  '])
  test(`Sale preserves Domain notes normalization ${JSON.stringify(notes)}`, async (t) => {
    const f = await salesFixture(t),
      productId = await f.product(),
      command = saleCommand(
        [
          {
            productId,
            quantity: 1,
            price: '7000000',
            cost: '5000000',
            estimatedCost: '5000000',
            estimatedProfit: '2000000',
          },
        ],
        notes,
      ),
      result = reconstructSaleResult(await f.run(command), command);
    assert.equal(
      result.sale.notes,
      notes === null || notes.trim() === '' ? null : notes.trim(),
    );
  });

test('legacy v4 Inventory and Product references preserve identity; new v7 Sale leaves Product metadata untouched', async (t) => {
  const f = await salesFixture(t),
    inventoryId = '550e8400-e29b-41d4-a716-446655440001',
    productId = '550e8400-e29b-41d4-a716-446655440000';
  await f.pool.query('UPDATE inventories SET id=$1 WHERE id=$2', [
    inventoryId,
    f.context.inventory.id,
  ]);
  f.context.inventory.id = inventoryId;
  await f.pool.query(
    'INSERT INTO products(id,inventory_id,name,regular_sale_price_units,created_at,updated_at) VALUES($1,$2,$3,42,100,100)',
    [productId, inventoryId, 'Legacy'],
  );
  await f.pool.query(
    'INSERT INTO inventory_states(inventory_id,product_id,stock,unit_cost_units)VALUES($1,$2,0,0)',
    [inventoryId, productId],
  );
  const command = saleCommand([
      {
        productId: productId.toUpperCase(),
        quantity: 1,
        price: '100',
        cost: '0',
        estimatedCost: '0',
        estimatedProfit: '100',
      },
    ]),
    result = reconstructSaleResult(await f.run(command), command);
  assert.equal(result.items[0].productId, productId);
  assert.equal(result.states[0].stock, -1);
  assert.equal(result.sale.id, command.payload.saleId);
  const product = (await f.pool.query('SELECT * FROM products')).rows[0];
  assert.equal(product.metadata_revision, '0');
  assert.equal(product.regular_sale_price_units, '42');
  assert.equal(product.is_archived, false);
});

test('safe stock underflow is DOMAIN_RULE rather than misclassified Money overflow', async (t) => {
  const f = await salesFixture(t),
    productId = await f.product(Number.MIN_SAFE_INTEGER, '0'),
    command = saleCommand([
      {
        productId,
        quantity: 1,
        price: '1',
        cost: '0',
        estimatedCost: '0',
        estimatedProfit: '1',
      },
    ]),
    result = await f.run(command);
  assert.equal(result.status, 'REJECTED');
  assert.ok('error' in result);
  assert.equal(result.error.code, 'DOMAIN_RULE');
  assert.equal(
    (await f.pool.query('SELECT count(*) FROM sales')).rows[0].count,
    '0',
  );
});
