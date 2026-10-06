import assert from 'node:assert/strict';
import { test } from 'node:test';
import { voidSalesFixture } from './helpers.js';
import { id } from '../postgres/helpers.js';

for (const [table, event, condition] of [
  ['inventory_movements', 'INSERT', "NEW.type='REVERSAL'"],
  ['inventory_states', 'UPDATE', 'true'],
  ['sales', 'UPDATE', 'true'],
  ['inventories', 'UPDATE', 'true'],
  ['inventory_change_sets', 'INSERT', 'true'],
  ['operation_receipts', 'INSERT', 'true'],
  [
    'inventory_movements',
    'INSERT',
    "NEW.type='REVERSAL' AND (SELECT count(*) FROM inventory_movements WHERE type='REVERSAL')=1",
  ],
] as const)
  test(`Void rollback ${table}/${condition} is complete and retry has no gap`, async (t) => {
    const f = await voidSalesFixture(t),
      sale = await f.sale(3),
      command = await f.command(sale.payload.saleId),
      before = await f.counts(f.context),
      states = (
        await f.pool.query('SELECT * FROM inventory_states ORDER BY product_id')
      ).rows,
      sales = (await f.pool.query('SELECT * FROM sales')).rows,
      movements = (
        await f.pool.query('SELECT * FROM inventory_movements ORDER BY id')
      ).rows,
      items = (await f.pool.query('SELECT * FROM sale_items ORDER BY id')).rows;
    await f.pool.query(
      `CREATE FUNCTION fail_void() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF ${condition} THEN RAISE EXCEPTION 'fictional fault'; END IF; RETURN NEW; END$$; CREATE TRIGGER fail_void BEFORE ${event} ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_void()`,
    );
    await assert.rejects(() => f.run(command));
    assert.deepEqual(await f.counts(f.context), before);
    assert.deepEqual(
      (await f.pool.query('SELECT * FROM inventory_states ORDER BY product_id'))
        .rows,
      states,
    );
    assert.deepEqual((await f.pool.query('SELECT * FROM sales')).rows, sales);
    assert.deepEqual(
      (await f.pool.query('SELECT * FROM inventory_movements ORDER BY id'))
        .rows,
      movements,
    );
    assert.deepEqual(
      (await f.pool.query('SELECT * FROM sale_items ORDER BY id')).rows,
      items,
    );
    await f.pool.query(`DROP TRIGGER fail_void ON ${table}`);
    const result = await f.result(await f.run(command), command);
    assert.equal(
      BigInt(result.committedRevision),
      BigInt(before.revision) + 1n,
    );
    assert.equal(result.reversals.length, 3);
  });
test('confirmed Sale with an existing reversal is corruption500 without terminal receipt or repair', async (t) => {
  const f = await voidSalesFixture(t),
    sale = await f.sale(),
    command = await f.command(sale.payload.saleId),
    original = (
      await f.pool.query("SELECT * FROM inventory_movements WHERE type='SALE'")
    ).rows[0];
  await f.pool.query(
    "INSERT INTO inventory_movements(id,inventory_id,product_id,type,quantity_delta,unit_cost_snapshot_units,stock_before,stock_after,source_type,source_id,reversal_of_movement_id,effective_at,created_at,updated_at)VALUES($1,$2,$3,'REVERSAL',2,5000000,8,10,'INVENTORY_MOVEMENT',$4,$4,1500,1600,1600)",
    [id(), f.context.inventory.id, original.product_id, original.id],
  );
  const before = await f.counts(f.context),
    states = (await f.pool.query('SELECT * FROM inventory_states')).rows;
  await assert.rejects(() => f.run(command));
  assert.deepEqual(await f.counts(f.context), before);
  assert.deepEqual(
    (await f.pool.query('SELECT * FROM inventory_states')).rows,
    states,
  );
  assert.equal(
    (await f.pool.query('SELECT status FROM sales')).rows[0].status,
    'CONFIRMED',
  );
  await assert.rejects(
    () =>
      f.pool.query(
        "INSERT INTO inventory_movements(id,inventory_id,product_id,type,quantity_delta,unit_cost_snapshot_units,stock_before,stock_after,source_type,source_id,reversal_of_movement_id,effective_at,created_at,updated_at)VALUES($1,$2,$3,'REVERSAL',2,5000000,8,10,'INVENTORY_MOVEMENT',$4,$4,1500,1600,1600)",
        [id(), f.context.inventory.id, original.product_id, original.id],
      ),
    { code: '23505', constraint: 'inventory_movements_reversal_unique' },
  );
});
test('technical state counter beyond JS-safe increments exactly; int64 maximum fails all lines atomically', async (t) => {
  const f = await voidSalesFixture(t),
    sale = await f.sale(2),
    product = sale.payload.items[0].productId;
  await f.pool.query(
    'UPDATE inventory_states SET state_revision=9007199254740992 WHERE product_id=$1',
    [product],
  );
  let command = await f.command(sale.payload.saleId);
  const result = await f.result(await f.run(command), command);
  assert.equal(
    result.states.find((s) => s.productId === product)?.stateRevision,
    '9007199254740993',
  );
  const otherSale = await f.sale(2),
    otherProduct = otherSale.payload.items[1].productId;
  await f.pool.query(
    'UPDATE inventory_states SET state_revision=9223372036854775807 WHERE product_id=$1',
    [otherProduct],
  );
  command = await f.command(otherSale.payload.saleId);
  const before = await f.counts(f.context),
    states = (
      await f.pool.query('SELECT * FROM inventory_states ORDER BY product_id')
    ).rows;
  await assert.rejects(() => f.run(command));
  assert.deepEqual(await f.counts(f.context), before);
  assert.deepEqual(
    (await f.pool.query('SELECT * FROM inventory_states ORDER BY product_id'))
      .rows,
    states,
  );
});
test('unexpected unique persistence error is internal and cannot become user DOMAIN_RULE', async (t) => {
  const f = await voidSalesFixture(t),
    sale = await f.sale(2),
    command = await f.command(sale.payload.saleId),
    before = await f.counts(f.context);
  await f.pool.query(
    "CREATE UNIQUE INDEX fictional_void_unique ON inventory_movements(type) WHERE type='REVERSAL'",
  );
  await assert.rejects(() => f.run(command));
  assert.deepEqual(await f.counts(f.context), before);
  assert.equal(
    (
      await f.pool.query(
        "SELECT count(*) FROM inventory_movements WHERE type='REVERSAL'",
      )
    ).rows[0].count,
    '0',
  );
});
