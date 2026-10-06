import assert from 'node:assert/strict';
import { test } from 'node:test';
import { purchasesFixture, purchaseCommand } from './helpers.js';
import { id } from '../postgres/helpers.js';

for (const mismatch of [
  'revision',
  'stock',
  'cost',
  'movement',
  'null-movement',
])
  test(`exact state mismatch ${mismatch} yields durable REVISION_CONFLICT before commercial SQL`, async (t) => {
    const f = await purchasesFixture(t),
      productId = await f.product(),
      command = await f.command(productId);
    if (mismatch === 'revision')
      command.preconditions.expectedStateRevision = '1';
    else if (mismatch === 'stock')
      command.preconditions.expectedState.stock = 19;
    else if (mismatch === 'cost')
      command.preconditions.expectedState.unitCost = '10000001';
    else
      command.preconditions.expectedState.lastMovementId =
        mismatch === 'movement' ? id() : null;
    await f.pool.query(
      "CREATE FUNCTION no_purchase_write() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'fictional purchase write'; END$$; CREATE TRIGGER no_purchase_write BEFORE INSERT ON purchases FOR EACH ROW EXECUTE FUNCTION no_purchase_write()",
    );
    const before = await f.counts(f.context),
      states = (await f.pool.query('SELECT * FROM inventory_states')).rows,
      receipt = await f.run(command);
    assert.equal(receipt.status, 'CONFLICT');
    assert.ok('error' in receipt);
    assert.equal(receipt.error.code, 'REVISION_CONFLICT');
    assert.deepEqual(receipt.error.details, { currentRevision: '0' });
    assert.deepEqual(
      (await f.pool.query('SELECT * FROM inventory_states')).rows,
      states,
    );
    const after = await f.counts(f.context);
    assert.equal(after.revision, before.revision);
    assert.equal(after.changes, before.changes);
    assert.equal(Number(after.receipts), Number(before.receipts) + 1);
    assert.equal(
      (await f.pool.query('SELECT count(*) FROM purchases')).rows[0].count,
      '0',
    );
    assert.deepEqual(await f.run(command), receipt);
  });
for (const [actual, expected] of [
  ['0', null],
  [null, '0'],
] as const)
  test(`state cost ${actual} is distinct from ${expected}`, async (t) => {
    const f = await purchasesFixture(t),
      productId = await f.product(0, actual),
      command = await f.command(productId);
    command.preconditions.expectedState.unitCost = expected;
    const result = await f.run(command);
    assert.equal(result.status, 'CONFLICT');
    assert.ok('error' in result);
    assert.equal(result.error.code, 'REVISION_CONFLICT');
  });
for (const unavailable of ['missing', 'foreign', 'archived'])
  test(`Purchase Product ${unavailable} returns generic terminal NOT_FOUND`, async (t) => {
    const f = await purchasesFixture(t),
      foreign = await f.dataset(),
      productId =
        unavailable === 'missing'
          ? id()
          : await f.product(
              20,
              '10000000',
              '15000000',
              unavailable === 'foreign' ? foreign : f.context,
            );
    if (unavailable === 'archived')
      await f.pool.query('UPDATE products SET is_archived=true WHERE id=$1', [
        productId,
      ]);
    const command = purchaseCommand(productId),
      result = await f.run(command);
    assert.equal(result.status, 'REJECTED');
    assert.ok('error' in result);
    assert.equal(result.error.code, 'NOT_FOUND');
    assert.equal(result.error.details, undefined);
    assert.equal(
      (await f.pool.query('SELECT count(*) FROM purchases')).rows[0].count,
      '0',
    );
  });
test('missing State and impossible positive-stock unknown-cost corruption are internal rollback', async (t) => {
  const f = await purchasesFixture(t),
    productId = await f.product(),
    command = await f.command(productId),
    before = await f.counts(f.context);
  await f.pool.query('DELETE FROM inventory_states WHERE product_id=$1', [
    productId,
  ]);
  await assert.rejects(() => f.run(command));
  assert.deepEqual(await f.counts(f.context), before);
  // Only this disposable corruption fixture bypasses the CHECK; runtime never disables constraints.
  await f.pool.query(
    'ALTER TABLE inventory_states DROP CONSTRAINT inventory_states_positive_stock_cost_required',
  );
  await f.pool.query(
    'INSERT INTO inventory_states(inventory_id,product_id,stock) VALUES($1,$2,20)',
    [f.context.inventory.id, productId],
  );
  await assert.rejects(() => f.run(command));
  assert.deepEqual(await f.counts(f.context), before);
});
for (const [label, stock, cost, quantity, inputCost, errorCode] of [
  ['total', 0, null, 2, '9007199254740991', 'MONEY_OVERFLOW'],
  ['old inventory value', 2, '9007199254740991', 1, '0', 'MONEY_OVERFLOW'],
  ['incoming value', 1, '1', 2, '9007199254740991', 'MONEY_OVERFLOW'],
  [
    'weighted sum',
    1,
    '5000000000000000',
    1,
    '5000000000000000',
    'MONEY_OVERFLOW',
  ],
  ['stock', Number.MAX_SAFE_INTEGER, '0', 1, '0', 'DOMAIN_RULE'],
] as const)
  test(`Purchase ${label} overflow is a narrow terminal ${errorCode}`, async (t) => {
    const f = await purchasesFixture(t),
      productId = await f.product(stock, cost),
      command = await f.command(productId, quantity, inputCost),
      before = await f.counts(f.context),
      states = (await f.pool.query('SELECT * FROM inventory_states')).rows;
    const result = await f.run(command);
    assert.equal(result.status, 'REJECTED');
    assert.ok('error' in result);
    assert.equal(result.error.code, errorCode);
    assert.deepEqual(
      (await f.pool.query('SELECT * FROM inventory_states')).rows,
      states,
    );
    assert.equal((await f.counts(f.context)).revision, before.revision);
    assert.equal(
      (await f.pool.query('SELECT count(*) FROM purchases')).rows[0].count,
      '0',
    );
  });
for (const collision of ['purchase', 'movement'])
  test(`different operation reusing ${collision} ID rejects without overwrite`, async (t) => {
    const f = await purchasesFixture(t),
      productId = await f.product(),
      first = await f.command(productId);
    await f.run(first);
    const second = await f.command(productId);
    if (collision === 'purchase')
      second.payload.purchaseId = first.payload.purchaseId;
    else second.payload.movementId = first.payload.movementId;
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
      (await f.pool.query('SELECT count(*) FROM purchases')).rows[0].count,
      '1',
    );
  });
test('conflict replay stays terminal after state returns to matching evidence', async (t) => {
  const f = await purchasesFixture(t),
    productId = await f.product(),
    command = await f.command(productId);
  await f.pool.query(
    'UPDATE inventory_states SET state_revision=1 WHERE product_id=$1',
    [productId],
  );
  const first = await f.run(command);
  assert.equal(first.status, 'CONFLICT');
  await f.pool.query(
    'UPDATE inventory_states SET state_revision=0 WHERE product_id=$1',
    [productId],
  );
  assert.deepEqual(await f.run(command), first);
  assert.equal(
    (await f.pool.query('SELECT count(*) FROM purchases')).rows[0].count,
    '0',
  );
});
