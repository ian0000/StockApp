import assert from 'node:assert/strict';
import { test } from 'node:test';
import { saleCommand, salesFixture } from './helpers.js';

test('unexpected unique constraint remains internal rollback rather than an allowlisted identity rejection', async (t) => {
  const f = await salesFixture(t),
    productId = await f.product();
  const first = saleCommand(
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
    'Fictional',
  );
  await f.run(first);
  await f.pool.query(
    'CREATE UNIQUE INDEX fictional_unexpected_unique ON sales(notes)',
  );
  const before = await f.counts(f.context),
    states = (await f.pool.query('SELECT * FROM inventory_states')).rows;
  await assert.rejects(() =>
    f.run(
      saleCommand(
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
        'Fictional',
      ),
    ),
  );
  assert.deepEqual(await f.counts(f.context), before);
  assert.deepEqual(
    (await f.pool.query('SELECT * FROM inventory_states')).rows,
    states,
  );
});

for (const [table, event, second] of [
  ['sales', 'INSERT', false],
  ['sale_items', 'INSERT', true],
  ['inventory_movements', 'INSERT', true],
  ['inventory_states', 'UPDATE', true],
  ['inventory_change_sets', 'INSERT', false],
  ['operation_receipts', 'INSERT', false],
] as const)
  test(`multiproduct rollback at ${table}${second ? ' #2' : ''} removes the entire operation without revision gap`, async (t) => {
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
    const condition = second
      ? table === 'sale_items'
        ? `NEW.id='${command.payload.items[1].saleItemId}'`
        : table === 'inventory_movements'
          ? `NEW.id='${command.payload.items[1].movementId}'`
          : `NEW.product_id='${b}'`
      : 'true';
    await f.pool.query(
      `CREATE FUNCTION fail_sale_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${condition} THEN RAISE EXCEPTION 'fictional late failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_sale_write BEFORE ${event} ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_sale_write()`,
    );
    const states = (
        await f.pool.query('SELECT * FROM inventory_states ORDER BY product_id')
      ).rows,
      before = await f.counts(f.context);
    await assert.rejects(() => f.run(command));
    assert.deepEqual(await f.counts(f.context), before);
    assert.deepEqual(
      (await f.pool.query('SELECT * FROM inventory_states ORDER BY product_id'))
        .rows,
      states,
    );
    for (const table of ['sales', 'sale_items'])
      assert.equal(
        (await f.pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count,
        '0',
      );
    assert.equal(
      (
        await f.pool.query(
          "SELECT count(*) FROM inventory_movements WHERE type='SALE'",
        )
      ).rows[0].count,
      '0',
    );
    await f.pool.query(`DROP TRIGGER fail_sale_write ON ${table}`);
    assert.equal((await f.run(command)).status, 'ACCEPTED');
    assert.equal((await f.counts(f.context)).revision, '3');
  });

test('stateRevision increments exactly beyond JS safe range; BIGINT max rolls back the full sale', async (t) => {
  const f = await salesFixture(t),
    a = await f.product(),
    b = await f.product();
  await f.pool.query(
    'UPDATE inventory_states SET state_revision=9007199254740993 WHERE product_id=$1',
    [a],
  );
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
  const accepted = await f.run(command);
  assert.ok('changeSet' in accepted);
  assert.equal(
    accepted.changeSet.upserts.inventoryStates[0].stateRevision,
    '9007199254740994',
  );
  await f.pool.query(
    'UPDATE inventory_states SET state_revision=9223372036854775807 WHERE product_id=$1',
    [b],
  );
  const before = await f.counts(f.context),
    states = (
      await f.pool.query('SELECT * FROM inventory_states ORDER BY product_id')
    ).rows;
  await assert.rejects(() =>
    f.run({
      ...command,
      operationId: '019a0000-0000-7000-8000-000000000001',
      payload: {
        ...command.payload,
        saleId: '019a0000-0000-7000-8000-000000000002',
        items: command.payload.items.map((i, index) => ({
          ...i,
          saleItemId: `019a0000-0000-7000-8000-00000000000${index + 3}`,
          movementId: `019a0000-0000-7000-8000-00000000000${index + 5}`,
        })),
      },
    }),
  );
  assert.deepEqual(await f.counts(f.context), before);
  assert.deepEqual(
    (await f.pool.query('SELECT * FROM inventory_states ORDER BY product_id'))
      .rows,
    states,
  );
});
