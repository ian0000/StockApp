import assert from 'node:assert/strict';
import { test } from 'node:test';
import { id } from '../postgres/helpers.js';
import { productsFixture, createCommand } from './helpers.js';

for (const [stock, cost] of [
  [0, null],
  [5, '10666667'],
  [5, '0'],
  [Number.MAX_SAFE_INTEGER, '9007199254740991'],
] as const) {
  test(`create Product stock=${stock}/cost=${cost}: exact state, Domain movement, initial revisions and identity`, async (t) => {
    const f = await productsFixture(t);
    const command = createCommand({
      initialStock: stock,
      initialUnitCost: cost,
      initialMovementId: stock ? id() : null,
      barcode: '001234',
      name: '  Fictional Product  ',
    });
    const receipt = await f.run(command);
    assert.equal(receipt.status, 'ACCEPTED');
    if ('error' in receipt) return assert.fail();
    const { upserts } = receipt.changeSet;
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(upserts).map(([k, v]) => [k, v.length]),
      ),
      {
        products: 1,
        inventoryStates: 1,
        inventoryMovements: stock ? 1 : 0,
        sales: 0,
        saleItems: 0,
        purchases: 0,
        stockAdjustments: 0,
      },
    );
    const result = await f.result(command);
    assert.ok('state' in result);
    assert.equal(result.product.id, command.payload.productId);
    assert.equal(result.product.metadataRevision, '0');
    assert.equal(result.product.name, 'Fictional Product');
    assert.equal(result.product.barcode, '001234');
    assert.equal(result.product.createdAt, 456);
    assert.equal(result.state.stateRevision, '0');
    assert.equal(result.state.stock, stock);
    assert.equal(result.state.unitCost, cost);
    assert.equal(
      result.state.lastMovementId,
      command.payload.initialMovementId,
    );
    if (result.initialMovement)
      assert.deepEqual(result.initialMovement, {
        id: command.payload.initialMovementId,
        inventoryId: f.context.inventory.id,
        productId: command.payload.productId,
        type: 'INITIAL_STOCK',
        quantityDelta: stock,
        stockBefore: 0,
        stockAfter: stock,
        unitCostSnapshot: cost,
        sourceType: null,
        sourceId: null,
        metadata: null,
        reversalOfMovementId: null,
        effectiveAt: 123,
        createdAt: 456,
        updatedAt: 456,
      });
    const state = (await f.pool.query('SELECT * FROM inventory_states'))
      .rows[0];
    assert.equal(state.stock, String(stock));
    assert.equal(state.unit_cost_units, cost);
    assert.equal(state.last_movement_id, command.payload.initialMovementId);
    assert.equal((await f.counts(f.context)).revision, '1');
    assert.equal(result.serverRecordedAt, 2000);
  });
}

test('cost at zero stock is a durable domain rejection, not unknown-to-zero substitution', async (t) => {
  const f = await productsFixture(t),
    command = createCommand({ initialUnitCost: '0' });
  const receipt = await f.run(command);
  assert.equal(receipt.status, 'REJECTED');
  assert.ok('error' in receipt);
  assert.equal(receipt.error.code, 'DOMAIN_RULE');
  assert.equal(
    (await f.pool.query('SELECT count(*) FROM products')).rows[0].count,
    '0',
  );
  assert.equal((await f.counts(f.context)).revision, '0');
  assert.deepEqual(await f.run(command), receipt);
  assert.equal((await f.counts(f.context)).receipts, '1');
});

for (const payload of [
  { initialStock: 1, initialUnitCost: null, initialMovementId: id() },
  { initialStock: -1 },
  { initialStock: 1.5 },
  { productId: '550e8400-e29b-41d4-a716-446655440000' },
]) {
  test(`invalid creation transport ${JSON.stringify(payload)} never creates a receipt`, async (t) => {
    const f = await productsFixture(t);
    await assert.rejects(() => f.run(createCommand(payload)), TypeError);
    assert.equal((await f.counts(f.context)).receipts, '0');
  });
}

test('duplicate Product identity with another operation rejects without overwriting', async (t) => {
  const f = await productsFixture(t),
    command = createCommand();
  await f.run(command);
  const duplicate = createCommand({
    productId: command.payload.productId,
    name: 'Overwrite',
  });
  const rejection = await f.run(duplicate);
  assert.equal(rejection.status, 'REJECTED');
  if ('error' in rejection) assert.equal(rejection.error.code, 'DOMAIN_RULE');
  assert.equal(
    (await f.pool.query('SELECT name FROM products')).rows[0].name,
    'Fictional Product',
  );
  assert.equal((await f.counts(f.context)).revision, '1');
});

for (const failureTable of [
  'inventory_movements',
  'inventory_states',
  'inventory_change_sets',
  'operation_receipts',
]) {
  test(`creation rollback on ${failureTable} failure leaves no partial commercial writes or receipt/revision`, async (t) => {
    const f = await productsFixture(t),
      command = createCommand({
        initialStock: 5,
        initialUnitCost: '0',
        initialMovementId: id(),
      });
    // Tables are a fixed test allowlist; injection is confined to this disposable database.
    await f.pool.query(
      `CREATE FUNCTION fail_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fictional failure'; END $$; CREATE TRIGGER fail_write BEFORE INSERT ON ${failureTable} FOR EACH ROW EXECUTE FUNCTION fail_write()`,
    );
    await assert.rejects(() => f.run(command));
    for (const table of [
      'products',
      'inventory_states',
      'inventory_movements',
      'inventory_change_sets',
      'operation_receipts',
    ])
      assert.equal(
        (await f.pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count,
        '0',
      );
    assert.equal((await f.counts(f.context)).revision, '0');
    await f.pool.query(`DROP TRIGGER fail_write ON ${failureTable}`);
    assert.equal((await f.run(command)).status, 'ACCEPTED');
    assert.equal((await f.counts(f.context)).revision, '1');
  });
}

test('same operation changed payload is 409 with original state and durable response preserved', async (t) => {
  const f = await productsFixture(t),
    command = createCommand();
  const original = await f.result(command);
  await assert.rejects(
    () =>
      f.run({ ...command, payload: { ...command.payload, name: 'Changed' } }),
    { statusCode: 409, code: 'IDEMPOTENCY_KEY_REUSED' },
  );
  assert.deepEqual(await f.result(command), original);
  assert.equal((await f.counts(f.context)).revision, '1');
});
