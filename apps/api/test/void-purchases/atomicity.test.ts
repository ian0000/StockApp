import assert from 'node:assert/strict';
import { test } from 'node:test';
import { voidPurchasesFixture } from './helpers.js';
import { id } from '../postgres/helpers.js';

for (const [table, event, condition] of [
  ['inventory_movements', 'INSERT', "NEW.type='REVERSAL'"],
  ['inventory_states', 'UPDATE', 'true'],
  ['purchases', 'UPDATE', 'true'],
  ['inventories', 'UPDATE', 'true'],
  ['inventory_change_sets', 'INSERT', 'true'],
  ['operation_receipts', 'INSERT', 'true'],
] as const)
  test(`Purchase void rollback at ${table} is complete and same-key retry has no gap`, async (t) => {
    const f = await voidPurchasesFixture(t),
      purchase = await f.purchase(),
      command = await f.command(purchase.payload.purchaseId),
      before = await f.counts(f.context),
      purchases = (await f.pool.query('SELECT * FROM purchases')).rows,
      states = (await f.pool.query('SELECT * FROM inventory_states')).rows,
      movements = (
        await f.pool.query('SELECT * FROM inventory_movements ORDER BY id')
      ).rows;
    await f.pool.query(
      `CREATE FUNCTION fail_void() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF ${condition} THEN RAISE EXCEPTION 'fictional fault'; END IF; RETURN NEW; END$$; CREATE TRIGGER fail_void BEFORE ${event} ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_void()`,
    );
    await assert.rejects(() => f.run(command));
    assert.deepEqual(await f.counts(f.context), before);
    assert.deepEqual(
      (await f.pool.query('SELECT * FROM purchases')).rows,
      purchases,
    );
    assert.deepEqual(
      (await f.pool.query('SELECT * FROM inventory_states')).rows,
      states,
    );
    assert.deepEqual(
      (await f.pool.query('SELECT * FROM inventory_movements ORDER BY id'))
        .rows,
      movements,
    );
    await f.pool.query(`DROP TRIGGER fail_void ON ${table}`);
    assert.equal(
      BigInt((await f.result(await f.run(command), command)).committedRevision),
      BigInt(before.revision) + 1n,
    );
  });
test('CONFIRMED Purchase with existing reversal is internal corruption; database unique still enforces one reversal', async (t) => {
  const f = await voidPurchasesFixture(t),
    purchase = await f.purchase(),
    command = await f.command(purchase.payload.purchaseId);
  await f.pool.query(
    "INSERT INTO inventory_movements(id,inventory_id,product_id,type,quantity_delta,unit_cost_snapshot_units,stock_before,stock_after,source_type,source_id,reversal_of_movement_id,effective_at,created_at,updated_at)VALUES($1,$2,$3,'REVERSAL',-10,12000000,30,20,'INVENTORY_MOVEMENT',$4,$4,1500,1600,1600)",
    [
      id(),
      f.context.inventory.id,
      purchase.payload.productId,
      purchase.payload.movementId,
    ],
  );
  const before = await f.counts(f.context),
    states = (await f.pool.query('SELECT * FROM inventory_states')).rows;
  await assert.rejects(() => f.run(command));
  assert.deepEqual(await f.counts(f.context), before);
  assert.deepEqual(
    (await f.pool.query('SELECT * FROM inventory_states')).rows,
    states,
  );
  await assert.rejects(
    () =>
      f.pool.query(
        "INSERT INTO inventory_movements(id,inventory_id,product_id,type,quantity_delta,unit_cost_snapshot_units,stock_before,stock_after,source_type,source_id,reversal_of_movement_id,effective_at,created_at,updated_at)VALUES($1,$2,$3,'REVERSAL',-10,12000000,30,20,'INVENTORY_MOVEMENT',$4,$4,1500,1600,1600)",
        [
          id(),
          f.context.inventory.id,
          purchase.payload.productId,
          purchase.payload.movementId,
        ],
      ),
    { code: '23505', constraint: 'inventory_movements_reversal_unique' },
  );
});
test('known duplicate reversal identity is terminal DOMAIN_RULE without writes', async (t) => {
  const f = await voidPurchasesFixture(t),
    purchase = await f.purchase(),
    other = await f.product(),
    command = await f.command(purchase.payload.purchaseId),
    existing = (
      await f.pool.query(
        'SELECT id FROM inventory_movements WHERE product_id=$1',
        [other],
      )
    ).rows[0].id;
  command.payload.reversalMovementId = existing;
  const before = await f.counts(f.context),
    result = await f.run(command);
  assert.equal(result.status, 'REJECTED');
  assert.ok('error' in result);
  assert.equal(result.error.code, 'DOMAIN_RULE');
  const after = await f.counts(f.context);
  assert.equal(after.revision, before.revision);
  assert.equal(after.changes, before.changes);
  assert.equal(
    (
      await f.pool.query(
        "SELECT count(*) FROM inventory_movements WHERE type='REVERSAL'",
      )
    ).rows[0].count,
    '0',
  );
});
test('state counter exceeds JS-safe exactly; int64 maximum rolls back all Purchase void effects', async (t) => {
  const f = await voidPurchasesFixture(t),
    purchase = await f.purchase();
  await f.pool.query(
    'UPDATE inventory_states SET state_revision=9007199254740992',
  );
  let command = await f.command(purchase.payload.purchaseId);
  assert.equal(
    (await f.result(await f.run(command), command)).states[0].stateRevision,
    '9007199254740993',
  );
  const other = await f.purchase();
  await f.pool.query(
    'UPDATE inventory_states SET state_revision=9223372036854775807 WHERE product_id=$1',
    [other.payload.productId],
  );
  command = await f.command(other.payload.purchaseId);
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

test('unexpected SQL unique failure is internal with complete rollback and no terminal receipt', async (t) => {
  const f = await voidPurchasesFixture(t),
    purchase = await f.purchase(),
    command = await f.command(purchase.payload.purchaseId);
  const before = await f.counts(f.context),
    states = (await f.pool.query('SELECT * FROM inventory_states')).rows;
  await f.pool.query(
    "CREATE FUNCTION unexpected_unique() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION USING ERRCODE='23505',CONSTRAINT='fictional_unexpected_unique'; END$$; CREATE TRIGGER unexpected_unique BEFORE INSERT ON inventory_movements FOR EACH ROW EXECUTE FUNCTION unexpected_unique()",
  );
  await assert.rejects(() => f.run(command));
  assert.deepEqual(await f.counts(f.context), before);
  assert.deepEqual(
    (await f.pool.query('SELECT * FROM inventory_states')).rows,
    states,
  );
  assert.equal(
    (
      await f.pool.query('SELECT status FROM purchases WHERE id=$1', [
        purchase.payload.purchaseId,
      ])
    ).rows[0].status,
    'CONFIRMED',
  );
});
