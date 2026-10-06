import assert from 'node:assert/strict';
import { test } from 'node:test';
import { productsFixture, createCommand, updateCommand } from './helpers.js';
import { id } from '../postgres/helpers.js';
import { executeProductCommand } from '../../src/products/execute.js';

for (const corruption of [
  'missing-product',
  'missing-state',
  'missing-movement',
  'wrong-last-movement',
  'wrong-stock',
  'unexpected-financial-upsert',
]) {
  test(`durable creation reconstruction rejects ${corruption} without reexecuting Application`, async (t) => {
    const f = await productsFixture(t),
      command = createCommand({
        initialStock: 5,
        initialUnitCost: '0',
        initialMovementId: id(),
      });
    const accepted = await f.run(command);
    assert.equal(accepted.status, 'ACCEPTED');
    const row = (
      await f.pool.query('SELECT changes FROM inventory_change_sets')
    ).rows[0];
    const changes = row.changes;
    if (corruption === 'missing-product') changes.upserts.products = [];
    if (corruption === 'missing-state') changes.upserts.inventoryStates = [];
    if (corruption === 'missing-movement')
      changes.upserts.inventoryMovements = [];
    if (corruption === 'wrong-last-movement')
      changes.upserts.inventoryStates[0].lastMovementId = id();
    if (corruption === 'wrong-stock')
      changes.upserts.inventoryStates[0].stock = 4;
    if (corruption === 'unexpected-financial-upsert')
      changes.upserts.sales = [
        {
          id: id(),
          inventoryId: f.context.inventory.id,
          status: 'CONFIRMED',
          totalAmount: '1',
          estimatedCost: null,
          estimatedProfit: null,
          notes: null,
          effectiveAt: 123,
          createdAt: 456,
          updatedAt: 456,
        },
      ];
    await f.pool.query('UPDATE inventory_change_sets SET changes=$1', [
      changes,
    ]);
    await assert.rejects(() => f.result(command));
    assert.equal((await f.counts(f.context)).revision, '1');
    assert.equal(
      (await f.pool.query('SELECT count(*) FROM products')).rows[0].count,
      '1',
    );
    assert.equal(
      (await f.pool.query('SELECT count(*) FROM inventory_movements')).rows[0]
        .count,
      '1',
    );
  });
}

test('DB unique defense rejects globally reused identity without revealing foreign data or raw primary key', async (t) => {
  const f = await productsFixture(t),
    foreign = await f.dataset(),
    original = createCommand({ name: 'Foreign' });
  await f.run(original, foreign);
  const result = await f.run(
    createCommand({ productId: original.payload.productId }),
  );
  assert.equal(result.status, 'REJECTED');
  assert.ok('error' in result);
  assert.equal(result.error.code, 'DOMAIN_RULE');
  assert.doesNotMatch(JSON.stringify(result), /Foreign|products_pkey|23505/);
  assert.equal((await f.counts(f.context)).revision, '0');
  assert.equal((await f.counts(f.context)).receipts, '1');
});

for (const failure of ['metadata-overflow', 'invalid-clock']) {
  test(`unexpected ${failure} rolls back without a terminal receipt`, async (t) => {
    const f = await productsFixture(t),
      create = createCommand();
    await f.run(create);
    if (failure === 'metadata-overflow')
      await f.pool.query(
        'UPDATE products SET metadata_revision=9223372036854775807',
      );
    const command = updateCommand(
      create.payload.productId,
      failure === 'metadata-overflow' ? '9223372036854775807' : '0',
    );
    await assert.rejects(() =>
      f.execute(
        f.input(f.context, command, (tx, inventory) =>
          executeProductCommand(tx, inventory.id, command, () => NaN),
        ),
      ),
    );
    assert.equal((await f.counts(f.context)).revision, '1');
    assert.equal((await f.counts(f.context)).receipts, '1');
  });
}
