import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createPostgresPool,
  createDatabase,
} from '../../src/infrastructure/postgres/client.js';
import { createCommandExecutor } from '../../src/infrastructure/postgres/command-executor.js';
import { executeProductCommand } from '../../src/products/execute.js';
import { createCommand, productsFixture, updateCommand } from './helpers.js';
import { waitForInventoryLock } from '../commands/helpers.js';
import { barrier } from '../helpers/commands.js';

for (const scenario of [
  'same-operation',
  'same-product',
  'same-barcode',
  'metadata',
]) {
  test(`PostgreSQL two-pool concurrency: ${scenario} commits exactly one commercial mutation`, async (t) => {
    let second: ReturnType<typeof createPostgresPool> | undefined;
    t.after(async () => {
      await second?.end();
    });
    const f = await productsFixture(t);
    second = createPostgresPool(f.pool.options.connectionString!);
    const executeB = createCommandExecutor(createDatabase(second), () => 2000);
    const first = createCommand({
      barcode: scenario === 'same-barcode' ? '001' : null,
    });
    if (scenario === 'metadata') {
      await f.run(first);
      await f.pool.query('UPDATE products SET metadata_revision=5');
    }
    const a =
      scenario === 'metadata'
        ? updateCommand(first.payload.productId, '5', { name: 'A' })
        : first;
    const b =
      scenario === 'metadata'
        ? updateCommand(first.payload.productId, '5', { name: 'B' })
        : scenario === 'same-operation'
          ? first
          : createCommand({
              productId:
                scenario === 'same-product'
                  ? first.payload.productId
                  : createCommand().payload.productId,
              barcode: scenario === 'same-barcode' ? '001' : null,
            });
    const entered = barrier(),
      release = barrier();
    let callbacks = 0;
    const promiseA = f.execute(
      f.input(f.context, a, async (tx, inventory) => {
        callbacks++;
        entered.release();
        await release.wait;
        return executeProductCommand(tx, inventory.id, a, () => 2000);
      }),
    );
    await entered.wait;
    const promiseB = executeB(
      f.input(f.context, b, async (tx, inventory) => {
        callbacks++;
        return executeProductCommand(tx, inventory.id, b, () => 2000);
      }),
    );
    // Register rejection handlers while asserting the database lock, avoiding unhandled promises.
    const completed = Promise.all([promiseA, promiseB]);
    try {
      await waitForInventoryLock(f.pool);
    } finally {
      release.release();
    }
    const [ra, rb] = await completed;
    assert.equal(ra.status, 'ACCEPTED');
    if (scenario === 'same-operation') {
      assert.deepEqual(rb, ra);
      assert.equal(callbacks, 1);
    } else {
      assert.equal(
        rb.status,
        scenario === 'metadata' ? 'CONFLICT' : 'REJECTED',
      );
      assert.equal(callbacks, 2);
    }
    if (scenario === 'metadata' && rb.status !== 'ACCEPTED')
      assert.deepEqual(rb.error.details, { currentRevision: '6' });
    assert.equal(
      (await f.counts(f.context)).revision,
      scenario === 'metadata' ? '2' : '1',
    );
    assert.equal(
      (await f.pool.query('SELECT count(*) FROM products')).rows[0].count,
      '1',
    );
    if (scenario === 'metadata')
      assert.equal(
        (await f.pool.query('SELECT metadata_revision FROM products')).rows[0]
          .metadata_revision,
        '6',
      );
  });
}

test('two independent Inventories can concurrently claim the same active barcode', async (t) => {
  const f = await productsFixture(t),
    b = await f.dataset();
  const results = await Promise.all([
    f.run(createCommand({ barcode: '001' })),
    f.run(createCommand({ barcode: '001' }), b),
  ]);
  assert.deepEqual(
    results.map((r) => r.status),
    ['ACCEPTED', 'ACCEPTED'],
  );
  assert.equal(
    (
      await f.pool.query('SELECT count(*) FROM products WHERE barcode=$1', [
        '001',
      ])
    ).rows[0].count,
    '2',
  );
});
