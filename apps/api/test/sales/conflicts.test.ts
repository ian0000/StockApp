import assert from 'node:assert/strict';
import { test } from 'node:test';
import { saleCommand, salesFixture } from './helpers.js';
import { id } from '../postgres/helpers.js';
import { reconstructSaleResult } from '../../src/sales/results.js';

for (const [cost, expected] of [
  ['6000000', '5000000'],
  ['0', null],
  ['5000000', null],
  [null, '5000000'],
  [null, '0'],
] as const)
  test(`cost evidence ${expected} vs canonical ${cost} creates durable conflict without writes`, async (t) => {
    const f = await salesFixture(t),
      productId = await f.product(cost === null ? 0 : 10, cost);
    const command = saleCommand([
      {
        productId,
        quantity: 1,
        price: '7000000',
        cost: expected,
        estimatedCost: expected,
        estimatedProfit:
          expected === null ? null : expected === '0' ? '7000000' : '2000000',
      },
    ]);
    const before = (await f.pool.query('SELECT * FROM inventory_states')).rows,
      revision = (await f.counts(f.context)).revision;
    const result = await f.run(command);
    assert.equal(result.status, 'CONFLICT');
    assert.ok('error' in result);
    assert.equal(result.error.code, 'COST_SNAPSHOT_CONFLICT');
    assert.equal(result.error.details, undefined);
    assert.equal(
      (await f.pool.query('SELECT count(*) FROM sales')).rows[0].count,
      '0',
    );
    assert.deepEqual(
      (await f.pool.query('SELECT * FROM inventory_states')).rows,
      before,
    );
    assert.equal((await f.counts(f.context)).revision, revision);
    await f.pool.query(
      'UPDATE inventory_states SET stock=0,unit_cost_units=$1',
      [expected],
    );
    assert.deepEqual(await f.run(command), result);
    assert.equal((await f.counts(f.context)).receipts, '2');
  });

for (const field of ['estimatedCost', 'estimatedProfit'] as const)
  test(`incorrect derived ${field} on second line conflicts before any SQL write`, async (t) => {
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
    );
    command.preconditions.expectedCosts[1][field] = '1';
    await f.pool.query(
      "CREATE FUNCTION reject_sale_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'writes must not happen'; END $$; CREATE TRIGGER reject_sale_write BEFORE INSERT ON sales FOR EACH ROW EXECUTE FUNCTION reject_sale_write()",
    );
    const states = (
      await f.pool.query('SELECT * FROM inventory_states ORDER BY product_id')
    ).rows;
    const result = await f.run(command);
    assert.equal(result.status, 'CONFLICT');
    assert.deepEqual(
      (await f.pool.query('SELECT * FROM inventory_states ORDER BY product_id'))
        .rows,
      states,
    );
    assert.equal((await f.counts(f.context)).revision, '2');
    assert.equal(
      (await f.pool.query('SELECT count(*) FROM sale_items')).rows[0].count,
      '0',
    );
  });

for (const missing of ['missing', 'archived', 'foreign'])
  test(`one ${missing} Product rejects the complete Sale without existence leaks`, async (t) => {
    const f = await salesFixture(t),
      a = await f.product(),
      other =
        missing === 'missing'
          ? id()
          : await f.product(
              10,
              '5000000',
              missing === 'foreign' ? await f.dataset() : f.context,
            );
    if (missing === 'archived')
      await f.pool.query('UPDATE products SET is_archived=true WHERE id=$1', [
        other,
      ]);
    const command = saleCommand(
      [a, other].map((productId) => ({
        productId,
        quantity: 1,
        price: '7000000',
        cost: '5000000',
        estimatedCost: '5000000',
        estimatedProfit: '2000000',
      })),
    );
    const states = (
      await f.pool.query('SELECT * FROM inventory_states ORDER BY product_id')
    ).rows;
    const result = await f.run(command);
    assert.equal(result.status, 'REJECTED');
    assert.ok('error' in result);
    assert.equal(result.error.code, 'NOT_FOUND');
    assert.doesNotMatch(
      JSON.stringify(result),
      /Fictional|5000000|barcode|stock|productId/,
    );
    assert.deepEqual(
      (await f.pool.query('SELECT * FROM inventory_states ORDER BY product_id'))
        .rows,
      states,
    );
    assert.equal(
      (await f.pool.query('SELECT count(*) FROM sales')).rows[0].count,
      '0',
    );
  });

test('missing InventoryState is internal corruption: no terminal receipt or partial sale', async (t) => {
  const f = await salesFixture(t),
    productId = await f.product();
  await f.pool.query('DELETE FROM inventory_states WHERE product_id=$1', [
    productId,
  ]);
  const before = await f.counts(f.context);
  await assert.rejects(() =>
    f.run(
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
    ),
  );
  assert.deepEqual(await f.counts(f.context), before);
  assert.equal(
    (await f.pool.query('SELECT count(*) FROM sales')).rows[0].count,
    '0',
  );
});

for (const kind of [
  'price-times-quantity',
  'cost-times-quantity',
  'sum-subtotals',
  'sum-costs',
])
  test(`real Money overflow ${kind} is terminal MONEY_OVERFLOW`, async (t) => {
    const f = await salesFixture(t),
      a = await f.product(
        kind === 'sum-subtotals' ? 0 : 10,
        kind === 'cost-times-quantity'
          ? '9007199254740991'
          : kind === 'sum-costs'
            ? '6000000000000000'
            : kind === 'sum-subtotals'
              ? null
              : '0',
      );
    let command;
    if (kind === 'price-times-quantity')
      command = saleCommand([
        {
          productId: a,
          quantity: 2,
          price: '9007199254740991',
          cost: '0',
          estimatedCost: '0',
          estimatedProfit: '9007199254740991',
        },
      ]);
    else if (kind === 'cost-times-quantity')
      command = saleCommand([
        {
          productId: a,
          quantity: 2,
          price: '1',
          cost: '9007199254740991',
          estimatedCost: '9007199254740991',
          estimatedProfit: '0',
        },
      ]);
    else {
      const b = await f.product(
        kind === 'sum-costs' ? 10 : 0,
        kind === 'sum-costs' ? '6000000000000000' : null,
      );
      command = saleCommand(
        [a, b].map((productId) => ({
          productId,
          quantity: 1,
          price: kind === 'sum-costs' ? '1' : '6000000000000000',
          cost: kind === 'sum-costs' ? '6000000000000000' : null,
          estimatedCost: kind === 'sum-costs' ? '6000000000000000' : null,
          estimatedProfit: kind === 'sum-costs' ? '-5999999999999999' : null,
        })),
      );
    }
    const before = await f.counts(f.context),
      states = (
        await f.pool.query('SELECT * FROM inventory_states ORDER BY product_id')
      ).rows;
    const result = await f.run(command);
    assert.equal(result.status, 'REJECTED');
    assert.ok('error' in result);
    assert.equal(result.error.code, 'MONEY_OVERFLOW');
    assert.equal((await f.counts(f.context)).revision, before.revision);
    assert.deepEqual(
      (await f.pool.query('SELECT * FROM inventory_states ORDER BY product_id'))
        .rows,
      states,
    );
    assert.equal(
      (await f.pool.query('SELECT count(*) FROM sales')).rows[0].count,
      '0',
    );
  });

for (const collision of ['sale', 'item', 'movement'])
  test(`different operation ${collision} ID collision is a sanitized terminal rejection`, async (t) => {
    const f = await salesFixture(t),
      productId = await f.product();
    const first = saleCommand([
      {
        productId,
        quantity: 1,
        price: '7000000',
        cost: '5000000',
        estimatedCost: '5000000',
        estimatedProfit: '2000000',
      },
    ]);
    await f.run(first);
    const second = saleCommand([
      {
        productId,
        quantity: 1,
        price: '7000000',
        cost: '5000000',
        estimatedCost: '5000000',
        estimatedProfit: '2000000',
      },
    ]);
    if (collision === 'sale') second.payload.saleId = first.payload.saleId;
    else if (collision === 'item')
      second.payload.items[0].saleItemId = first.payload.items[0].saleItemId;
    else second.payload.items[0].movementId = first.payload.items[0].movementId;
    const before = (await f.pool.query('SELECT * FROM inventory_states')).rows,
      result = await f.run(second);
    assert.equal(result.status, 'REJECTED');
    assert.ok('error' in result);
    assert.equal(result.error.code, 'DOMAIN_RULE');
    assert.deepEqual(
      (await f.pool.query('SELECT * FROM inventory_states')).rows,
      before,
    );
    assert.equal(
      (await f.pool.query('SELECT count(*) FROM sales')).rows[0].count,
      '1',
    );
  });

test('replay retains historical cost/stock after later canonical state changes; different hash cannot overwrite', async (t) => {
  const f = await salesFixture(t),
    productId = await f.product();
  const command = saleCommand([
    {
      productId,
      quantity: 2,
      price: '7000000',
      cost: '5000000',
      estimatedCost: '10000000',
      estimatedProfit: '4000000',
    },
  ]);
  const original = reconstructSaleResult(await f.run(command), command);
  await f.pool.query(
    'UPDATE inventory_states SET stock=3,unit_cost_units=6000000,state_revision=5',
  );
  assert.deepEqual(
    reconstructSaleResult(await f.run(command), command),
    original,
  );
  await assert.rejects(
    () =>
      f.run({ ...command, payload: { ...command.payload, notes: 'Changed' } }),
    { statusCode: 409, code: 'IDEMPOTENCY_KEY_REUSED' },
  );
  assert.equal(
    (await f.pool.query('SELECT stock FROM inventory_states')).rows[0].stock,
    '3',
  );
});
