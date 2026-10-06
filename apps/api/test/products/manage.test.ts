import assert from 'node:assert/strict';
import { test } from 'node:test';
import { id } from '../postgres/helpers.js';
import {
  productsFixture,
  createCommand,
  updateCommand,
  archiveCommand,
} from './helpers.js';

test('update reuses Application, increments only metadata, preserves exact state/history and uses authoritative server time', async (t) => {
  const f = await productsFixture(t),
    create = createCommand({
      initialStock: 5,
      initialUnitCost: '10666667',
      initialMovementId: id(),
      createdAt: 3000,
    });
  await f.run(create);
  const states = (await f.pool.query('SELECT * FROM inventory_states')).rows;
  const movements = (await f.pool.query('SELECT * FROM inventory_movements'))
    .rows;
  const update = {
    ...updateCommand(create.payload.productId),
    occurredAt: 99999999,
  };
  const receipt = await f.run(update);
  assert.equal(receipt.status, 'ACCEPTED');
  if ('error' in receipt) return assert.fail();
  assert.equal(receipt.changeSet.upserts.products[0].metadataRevision, '1');
  assert.equal(receipt.changeSet.upserts.products[0].updatedAt, 3000);
  assert.equal(
    receipt.changeSet.upserts.products[0].regularSalePrice,
    '9007199254740991',
  );
  assert.equal(receipt.changeSet.upserts.inventoryStates.length, 0);
  assert.equal(receipt.changeSet.upserts.inventoryMovements.length, 0);
  assert.deepEqual(
    (await f.pool.query('SELECT * FROM inventory_states')).rows,
    states,
  );
  assert.deepEqual(
    (await f.pool.query('SELECT * FROM inventory_movements')).rows,
    movements,
  );
  assert.deepEqual(await f.result(update), await f.result(update));
  assert.equal((await f.counts(f.context)).revision, '2');
});

test('stale update persists durable conflict/current metadata revision, no writes; retries retain the original conflict', async (t) => {
  const f = await productsFixture(t),
    create = createCommand();
  await f.run(create);
  await f.run(updateCommand(create.payload.productId));
  const stale = updateCommand(create.payload.productId, '0', { name: 'Stale' });
  const conflict = await f.run(stale);
  assert.equal(conflict.status, 'CONFLICT');
  if ('error' in conflict)
    assert.deepEqual(conflict.error.details, { currentRevision: '1' });
  await f.run(updateCommand(create.payload.productId, '1'));
  assert.deepEqual(await f.run(stale), conflict);
  assert.equal((await f.counts(f.context)).revision, '3');
});

test('metadata revision remains exact beyond JS safe range independently of inventory revision', async (t) => {
  const f = await productsFixture(t),
    create = createCommand();
  await f.run(create);
  await f.pool.query('UPDATE products SET metadata_revision=9007199254740993');
  const result = await f.result(
    updateCommand(create.payload.productId, '9007199254740993'),
  );
  assert.equal(result.product.metadataRevision, '9007199254740994');
  assert.equal(result.committedRevision, '2');
});

test('archive is a single Product upsert, preserves initial state/history, replays and frees active barcode', async (t) => {
  const f = await productsFixture(t),
    create = createCommand({
      barcode: '001',
      initialStock: 5,
      initialUnitCost: '0',
      initialMovementId: id(),
    });
  await f.run(create);
  const states = (await f.pool.query('SELECT * FROM inventory_states')).rows;
  const movements = (await f.pool.query('SELECT * FROM inventory_movements'))
    .rows;
  const archive = archiveCommand(create.payload.productId),
    accepted = await f.run(archive);
  assert.equal(accepted.status, 'ACCEPTED');
  if ('error' in accepted) return assert.fail();
  assert.equal(accepted.changeSet.upserts.products[0].metadataRevision, '1');
  assert.equal(accepted.changeSet.upserts.products[0].isArchived, true);
  assert.equal(accepted.changeSet.upserts.inventoryStates.length, 0);
  assert.deepEqual(accepted.changeSet.tombstones, []);
  assert.deepEqual(await f.run(archive), accepted);
  assert.deepEqual(
    (await f.pool.query('SELECT * FROM inventory_states')).rows,
    states,
  );
  assert.deepEqual(
    (await f.pool.query('SELECT * FROM inventory_movements')).rows,
    movements,
  );
  const again = await f.run(archiveCommand(create.payload.productId, '1'));
  assert.equal(again.status, 'REJECTED');
  if ('error' in again) assert.equal(again.error.code, 'DOMAIN_RULE');
  assert.equal((await f.counts(f.context)).revision, '2');
  assert.equal(
    (await f.run(createCommand({ barcode: '001' }))).status,
    'ACCEPTED',
  );
});

test('archived product cannot be edited and missing/foreign Product queries remain scoped', async (t) => {
  const f = await productsFixture(t),
    a = createCommand(),
    b = await f.dataset(),
    foreign = createCommand();
  await f.run(a);
  await f.run(foreign, b);
  await f.run(archiveCommand(a.payload.productId));
  for (const command of [
    updateCommand(a.payload.productId, '1'),
    updateCommand(foreign.payload.productId),
    archiveCommand(foreign.payload.productId),
    updateCommand(id()),
    archiveCommand(id()),
  ]) {
    const result = await f.run(command);
    assert.equal(result.status, 'REJECTED');
    if ('error' in result) assert.equal(result.error.code, 'NOT_FOUND');
  }
  assert.equal((await f.counts(f.context)).revision, '2');
  assert.equal((await f.counts(b)).revision, '1');
});

test('active barcode uniqueness is scoped, normalized by Domain, keeps leading zeroes and permits self updates', async (t) => {
  const f = await productsFixture(t),
    a = createCommand({ barcode: '001' }),
    b = createCommand();
  await f.run(a);
  await f.run(b);
  assert.equal(
    (await f.run(createCommand({ barcode: ' 001 ' }))).status,
    'REJECTED',
  );
  assert.equal(
    (await f.run(updateCommand(b.payload.productId, '0', { barcode: '001' })))
      .status,
    'REJECTED',
  );
  assert.equal(
    (await f.run(updateCommand(a.payload.productId, '0', { barcode: '001' })))
      .status,
    'ACCEPTED',
  );
  assert.equal(
    (await f.run(createCommand({ barcode: '001' }), await f.dataset())).status,
    'ACCEPTED',
  );
});

test('legacy UUIDv4 Product and Inventory references update/archive with case-insensitive transport IDs', async (t) => {
  const f = await productsFixture(t),
    legacyProduct = '550e8400-e29b-41d4-a716-446655440000',
    legacyInventory = '550e8400-e29b-41d4-a716-446655440001';
  await f.pool.query('UPDATE inventories SET id=$1 WHERE id=$2', [
    legacyInventory,
    f.context.inventory.id,
  ]);
  f.context.inventory.id = legacyInventory;
  await f.pool.query(
    'INSERT INTO products (id,inventory_id,name,regular_sale_price_units,created_at,updated_at) VALUES ($1,$2,$3,0,100,100)',
    [legacyProduct, legacyInventory, 'Legacy'],
  );
  const update = await f.result(updateCommand(legacyProduct.toUpperCase()));
  assert.equal(update.product.id, legacyProduct);
  assert.equal(update.product.metadataRevision, '1');
  const archive = await f.result(
    archiveCommand(legacyProduct.toUpperCase(), '1'),
  );
  assert.equal(archive.product.isArchived, true);
});

test('stale archive does not mutate metadata/state or consume inventory revision', async (t) => {
  const f = await productsFixture(t),
    create = createCommand();
  await f.run(create);
  const result = await f.run(archiveCommand(create.payload.productId, '7'));
  assert.equal(result.status, 'CONFLICT');
  assert.equal((await f.counts(f.context)).revision, '1');
  assert.equal(
    (await f.pool.query('SELECT is_archived FROM products')).rows[0]
      .is_archived,
    false,
  );
});
