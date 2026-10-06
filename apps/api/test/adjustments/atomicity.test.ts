import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adjustmentsFixture } from './helpers.js';
import { reconstructAdjustmentResult } from '../../src/adjustments/results.js';

for (const [table, event] of [
  ['stock_adjustments', 'INSERT'],
  ['inventory_movements', 'INSERT'],
  ['inventory_states', 'UPDATE'],
  ['inventories', 'UPDATE'],
  ['inventory_change_sets', 'INSERT'],
  ['operation_receipts', 'INSERT'],
] as const)
  test(`Adjustment rollback at ${table} has no partial writes, terminal receipt or revision gap`, async (t) => {
    const f = await adjustmentsFixture(t),
      productId = await f.product(),
      command = await f.command(productId),
      before = await f.counts(f.context),
      states = (await f.pool.query('SELECT * FROM inventory_states')).rows,
      products = (await f.pool.query('SELECT * FROM products')).rows,
      movements = (await f.pool.query('SELECT * FROM inventory_movements'))
        .rows;
    await f.pool.query(
      `CREATE FUNCTION fail_adjustment() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'fictional rollback'; END$$; CREATE TRIGGER fail_adjustment BEFORE ${event} ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_adjustment()`,
    );
    await assert.rejects(() => f.run(command));
    assert.deepEqual(await f.counts(f.context), before);
    assert.deepEqual(
      (await f.pool.query('SELECT * FROM inventory_states')).rows,
      states,
    );
    assert.deepEqual(
      (await f.pool.query('SELECT * FROM products')).rows,
      products,
    );
    assert.deepEqual(
      (await f.pool.query('SELECT * FROM inventory_movements')).rows,
      movements,
    );
    assert.equal(
      (await f.pool.query('SELECT count(*) FROM stock_adjustments')).rows[0]
        .count,
      '0',
    );
    await f.pool.query(`DROP TRIGGER fail_adjustment ON ${table}`);
    const receipt = await f.run(command);
    assert.equal(receipt.status, 'ACCEPTED');
    assert.ok('changeSet' in receipt);
    assert.equal(
      BigInt(receipt.changeSet.revision),
      BigInt(before.revision) + 1n,
    );
  });
test('unexpected unique violation remains internal, not an identity rejection', async (t) => {
  const f = await adjustmentsFixture(t),
    productId = await f.product(),
    first = await f.command(productId, 40);

  await f.run(first);
  await f.pool.query(
    'CREATE UNIQUE INDEX fictional_unexpected_unique ON stock_adjustments(product_id)',
  );
  const next = await f.command(productId, 50);

  const before = await f.counts(f.context),
    states = (await f.pool.query('SELECT * FROM inventory_states')).rows;
  await assert.rejects(() => f.run(next));
  assert.deepEqual(await f.counts(f.context), before);
  assert.deepEqual(
    (await f.pool.query('SELECT * FROM inventory_states')).rows,
    states,
  );
});
test('state revisions above JS-safe remain exact; int64 max rolls back without receipt', async (t) => {
  const f = await adjustmentsFixture(t),
    productId = await f.product();
  await f.pool.query(
    'UPDATE inventory_states SET state_revision=9007199254740992 WHERE product_id=$1',
    [productId],
  );
  const command = await f.command(productId),
    result = reconstructAdjustmentResult(await f.run(command), command);
  assert.equal(command.preconditions.expectedStateRevision, '9007199254740992');
  assert.equal(result.state.stateRevision, '9007199254740993');
  await f.pool.query(
    'UPDATE inventory_states SET state_revision=9223372036854775807 WHERE product_id=$1',
    [productId],
  );
  const before = await f.counts(f.context),
    next = await f.command(productId, 40),
    states = (await f.pool.query('SELECT * FROM inventory_states')).rows;
  await assert.rejects(() => f.run(next));
  assert.deepEqual(await f.counts(f.context), before);
  assert.deepEqual(
    (await f.pool.query('SELECT * FROM inventory_states')).rows,
    states,
  );
});
