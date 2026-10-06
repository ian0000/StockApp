import assert from 'node:assert/strict';
import { test } from 'node:test';
import { purchasesFixture } from './helpers.js';
import { reconstructPurchaseResult } from '../../src/purchases/results.js';

for (const [table, event] of [
  ['purchases', 'INSERT'],
  ['inventory_movements', 'INSERT'],
  ['inventory_states', 'UPDATE'],
  ['inventory_change_sets', 'INSERT'],
  ['operation_receipts', 'INSERT'],
] as const)
  test(`Purchase rollback at ${table} has no partial writes, terminal receipt or revision gap`, async (t) => {
    const f = await purchasesFixture(t),
      productId = await f.product(),
      command = await f.command(productId),
      before = await f.counts(f.context),
      states = (await f.pool.query('SELECT * FROM inventory_states')).rows,
      products = (await f.pool.query('SELECT * FROM products')).rows,
      movements = (await f.pool.query('SELECT * FROM inventory_movements'))
        .rows;
    await f.pool.query(
      `CREATE FUNCTION fail_purchase() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'fictional rollback'; END$$; CREATE TRIGGER fail_purchase BEFORE ${event} ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_purchase()`,
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
      (await f.pool.query('SELECT count(*) FROM purchases')).rows[0].count,
      '0',
    );
    await f.pool.query(`DROP TRIGGER fail_purchase ON ${table}`);
    const receipt = await f.run(command);
    assert.equal(receipt.status, 'ACCEPTED');
    assert.ok('changeSet' in receipt);
    assert.equal(
      BigInt(receipt.changeSet.revision),
      BigInt(before.revision) + 1n,
    );
  });
test('Product snapshot validation failure rolls back all staged commercial effects', async (t) => {
  const f = await purchasesFixture(t),
    productId = await f.product(),
    command = await f.command(productId);
  await f.pool.query(
    'ALTER TABLE products DROP CONSTRAINT products_metadata_revision_nonnegative',
  );
  await f.pool.query('UPDATE products SET metadata_revision=-1 WHERE id=$1', [
    productId,
  ]);
  const before = await f.counts(f.context),
    states = (await f.pool.query('SELECT * FROM inventory_states')).rows;
  await assert.rejects(() => f.run(command));
  assert.deepEqual(await f.counts(f.context), before);
  assert.deepEqual(
    (await f.pool.query('SELECT * FROM inventory_states')).rows,
    states,
  );
  assert.equal(
    (await f.pool.query('SELECT count(*) FROM purchases')).rows[0].count,
    '0',
  );
});
test('unexpected unique violation remains internal, not an identity rejection', async (t) => {
  const f = await purchasesFixture(t),
    productId = await f.product(),
    first = await f.command(productId);
  first.payload.notes = 'Fictional';
  await f.run(first);
  await f.pool.query(
    'CREATE UNIQUE INDEX fictional_unexpected_unique ON purchases(notes)',
  );
  const next = await f.command(productId);
  next.payload.notes = 'Fictional';
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
  const f = await purchasesFixture(t),
    productId = await f.product();
  await f.pool.query(
    'UPDATE inventory_states SET state_revision=9007199254740992 WHERE product_id=$1',
    [productId],
  );
  const command = await f.command(productId),
    result = reconstructPurchaseResult(await f.run(command), command);
  assert.equal(result.beforeState.stateRevision, '9007199254740992');
  assert.equal(result.afterState.stateRevision, '9007199254740993');
  await f.pool.query(
    'UPDATE inventory_states SET state_revision=9223372036854775807 WHERE product_id=$1',
    [productId],
  );
  const before = await f.counts(f.context),
    next = await f.command(productId),
    states = (await f.pool.query('SELECT * FROM inventory_states')).rows;
  await assert.rejects(() => f.run(next));
  assert.deepEqual(await f.counts(f.context), before);
  assert.deepEqual(
    (await f.pool.query('SELECT * FROM inventory_states')).rows,
    states,
  );
});
test('Purchase never updates Product even when price analysis suggests an increase', async (t) => {
  const f = await purchasesFixture(t),
    productId = await f.product(0, '10000000'),
    command = await f.command(productId, 1, '12000000');
  await f.pool.query(
    "CREATE FUNCTION no_product_update() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Product must not be updated'; END$$; CREATE TRIGGER no_product_update BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION no_product_update()",
  );
  const result = reconstructPurchaseResult(await f.run(command), command);
  assert.equal(result.priceAnalysis.suggestedSalePrice, '18000000');
  assert.equal(result.product.metadataRevision, '0');
});
