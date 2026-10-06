import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adjustmentsFixture, adjustmentCommand } from './helpers.js';
import { reconstructAdjustmentResult } from '../../src/adjustments/results.js';
import { id } from '../postgres/helpers.js';

for (const mismatch of [
  'revision',
  'stock',
  'cost',
  'movement',
  'null-movement',
])
  test(`exact ${mismatch} conflict precedes adjustment writes`, async (t) => {
    const f = await adjustmentsFixture(t),
      product = await f.product(),
      command = await f.command(product);
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
      "CREATE FUNCTION no_adjustment() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'unexpected write'; END$$; CREATE TRIGGER no_adjustment BEFORE INSERT ON stock_adjustments FOR EACH ROW EXECUTE FUNCTION no_adjustment()",
    );
    const before = await f.counts(f.context),
      states = (await f.pool.query('SELECT * FROM inventory_states')).rows,
      result = await f.run(command);
    assert.equal(result.status, 'CONFLICT');
    assert.ok('error' in result);
    assert.equal(result.error.code, 'REVISION_CONFLICT');
    assert.deepEqual(result.error.details, { currentRevision: '0' });
    assert.deepEqual(await f.run(command), result);
    assert.equal((await f.counts(f.context)).revision, before.revision);
    assert.equal((await f.counts(f.context)).changes, before.changes);
    assert.deepEqual(
      (await f.pool.query('SELECT * FROM inventory_states')).rows,
      states,
    );
  });
for (const [actual, expected] of [
  ['0', null],
  [null, '0'],
] as const)
  test(`null and zero cost differ: ${actual}/${expected}`, async (t) => {
    const f = await adjustmentsFixture(t),
      product = await f.product(0, actual),
      command = await f.command(product);
    command.preconditions.expectedState.unitCost = expected;
    assert.equal((await f.run(command)).status, 'CONFLICT');
  });
for (const unavailable of ['missing', 'foreign', 'archived'])
  test(`Adjustment Product ${unavailable} is terminal NOT_FOUND`, async (t) => {
    const f = await adjustmentsFixture(t),
      other = await f.dataset(),
      product =
        unavailable === 'missing'
          ? id()
          : await f.product(
              20,
              '10000000',
              '15000000',
              unavailable === 'foreign' ? other : f.context,
            );
    if (unavailable === 'archived')
      await f.pool.query('UPDATE products SET is_archived=true WHERE id=$1', [
        product,
      ]);
    const command = adjustmentCommand(product),
      result = await f.run(command);
    assert.equal(result.status, 'REJECTED');
    assert.ok('error' in result);
    assert.equal(result.error.code, 'NOT_FOUND');
    assert.equal(result.error.details, undefined);
    assert.deepEqual(await f.run(command), result);
  });
test('missing state and negative adjustment of corrupt positive unknown cost fail internally without receipt', async (t) => {
  const f = await adjustmentsFixture(t),
    product = await f.product(),
    command = await f.command(product, 19, null, null),
    before = await f.counts(f.context);
  await f.pool.query('DELETE FROM inventory_states WHERE product_id=$1', [
    product,
  ]);
  await assert.rejects(() => f.run(command));
  assert.deepEqual(await f.counts(f.context), before);
  // This impossible state exists only in the disposable corruption fixture.
  await f.pool.query(
    'ALTER TABLE inventory_states DROP CONSTRAINT inventory_states_positive_stock_cost_required',
  );
  await f.pool.query(
    'INSERT INTO inventory_states(inventory_id,product_id,stock) VALUES($1,$2,20)',
    [f.context.inventory.id, product],
  );
  command.preconditions.expectedState.unitCost = null;
  command.preconditions.expectedState.lastMovementId = null;
  await assert.rejects(() => f.run(command));
  assert.deepEqual(await f.counts(f.context), before);
});
for (const [label, stock, cost, actual, custom, code] of [
  ['old value', 2, '9007199254740991', 3, '0', 'MONEY_OVERFLOW'],
  ['incoming value', 1, '1', 3, '9007199254740991', 'MONEY_OVERFLOW'],
  ['sum', 1, '5000000000000000', 2, '5000000000000000', 'MONEY_OVERFLOW'],
  ['difference', -Number.MAX_SAFE_INTEGER, null, 1, '0', 'DOMAIN_RULE'],
] as const)
  test(`Adjustment ${label} overflow returns ${code}`, async (t) => {
    const f = await adjustmentsFixture(t),
      product = await f.product(stock, cost),
      command = await f.command(product, actual, 'CUSTOM_COST', custom),
      before = await f.counts(f.context),
      states = (await f.pool.query('SELECT * FROM inventory_states')).rows,
      result = await f.run(command);
    assert.equal(result.status, 'REJECTED');
    assert.ok('error' in result);
    assert.equal(result.error.code, code);
    assert.equal((await f.counts(f.context)).revision, before.revision);
    assert.deepEqual(
      (await f.pool.query('SELECT * FROM inventory_states')).rows,
      states,
    );
  });
for (const field of ['stockAdjustmentId', 'movementId'] as const)
  test(`Adjustment identity ${field} collision cannot overwrite`, async (t) => {
    const f = await adjustmentsFixture(t),
      product = await f.product(),
      first = await f.command(product);
    await f.run(first);
    const second = await f.command(product, 40);
    second.payload[field] = first.payload[field];
    const states = (await f.pool.query('SELECT * FROM inventory_states')).rows,
      result = await f.run(second);
    assert.equal(result.status, 'REJECTED');
    assert.ok('error' in result);
    assert.equal(result.error.code, 'DOMAIN_RULE');
    assert.deepEqual(
      (await f.pool.query('SELECT * FROM inventory_states')).rows,
      states,
    );
    assert.equal(
      (await f.pool.query('SELECT count(*) FROM stock_adjustments')).rows[0]
        .count,
      '1',
    );
  });
test('UUIDv4 Inventory/Product and uppercase evidence retain equality with v7 new identities', async (t) => {
  const f = await adjustmentsFixture(t),
    inventory = '550e8400-e29b-41d4-a716-446655440001',
    product = '550e8400-e29b-41d4-a716-446655440000';
  await f.pool.query('UPDATE inventories SET id=$1 WHERE id=$2', [
    inventory,
    f.context.inventory.id,
  ]);
  f.context.inventory.id = inventory;
  await f.pool.query(
    "INSERT INTO products(id,inventory_id,name,regular_sale_price_units,created_at,updated_at)VALUES($1,$2,'Legacy',15000000,100,100)",
    [product, inventory],
  );
  await f.pool.query(
    'INSERT INTO inventory_states(inventory_id,product_id,stock,unit_cost_units)VALUES($1,$2,0,0)',
    [inventory, product],
  );
  const command = await f.command(product, 1, 'USE_CURRENT_COST', null);
  command.payload.productId = product.toUpperCase();
  command.payload.stockAdjustmentId =
    command.payload.stockAdjustmentId.toUpperCase();
  command.payload.movementId = command.payload.movementId.toUpperCase();
  const result = reconstructAdjustmentResult(await f.run(command), command);
  assert.equal(result.adjustment.productId, product);
  assert.equal(
    result.adjustment.id,
    command.payload.stockAdjustmentId.toLowerCase(),
  );
  const next = await f.command(product, 2, 'USE_CURRENT_COST', null);
  next.preconditions.expectedState.lastMovementId =
    result.movement.id.toUpperCase();
  assert.equal(
    reconstructAdjustmentResult(await f.run(next), next).state.stateRevision,
    '2',
  );
});
