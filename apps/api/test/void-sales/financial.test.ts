import assert from 'node:assert/strict';
import { test } from 'node:test';
import { voidSalesFixture } from './helpers.js';

for (const [count, stock, cost] of [
  [1, 10, '5000000'],
  [2, 10, '5000000'],
  [3, 10, '5000000'],
  [1, 0, null],
  [2, 0, null],
  [1, -5, '5000000'],
  [1, 1, '5000000'],
  [1, 10, '0'],
] as const)
  test(`Void restores ${count} lines from stock ${stock}, cost ${cost}`, async (t) => {
    const f = await voidSalesFixture(t),
      sale = await f.sale(count, stock, cost),
      command = await f.command(sale.payload.saleId),
      before = await f.counts(f.context),
      items = (await f.pool.query('SELECT * FROM sale_items')).rows,
      originals = (
        await f.pool.query(
          "SELECT * FROM inventory_movements WHERE type='SALE' ORDER BY product_id",
        )
      ).rows,
      products = (await f.pool.query('SELECT * FROM products')).rows,
      beforeSale = (await f.pool.query('SELECT * FROM sales')).rows[0];
    const receipt = await f.run(command),
      result = await f.result(receipt, command);
    assert.equal(result.kind, 'VOIDED');
    assert.equal(result.sale.status, 'VOIDED');
    assert.equal(result.sale.updatedAt, 2000);
    assert.equal(result.sale.effectiveAt, 900);
    assert.equal(result.sale.createdAt, 1000);
    assert.equal(result.reversals.length, count);
    assert.equal(result.states.length, count);
    for (const movement of result.reversals) {
      const original = originals.find(
          (row) => row.product_id === movement.productId,
        ),
        state = result.states.find(
          (row) => row.productId === movement.productId,
        ),
        input = command.payload.reversalMovements.find(
          (row) => row.productId === movement.productId,
        );
      assert.ok(original && state && input);
      assert.equal(movement.id, input.movementId);
      assert.equal(movement.type, 'REVERSAL');
      assert.equal(movement.quantityDelta, 2);
      assert.equal(movement.stockBefore, stock - 2);
      assert.equal(movement.stockAfter, stock);
      assert.equal(movement.unitCostSnapshot, cost);
      assert.equal(movement.sourceType, 'INVENTORY_MOVEMENT');
      assert.equal(movement.sourceId, original.id);
      assert.equal(movement.reversalOfMovementId, original.id);
      assert.equal(movement.metadata, null);
      assert.equal(movement.effectiveAt, 1500);
      assert.equal(movement.createdAt, 1600);
      assert.equal(movement.updatedAt, 1600);
      assert.equal(state.stock, stock);
      assert.equal(state.unitCost, cost);
      assert.equal(state.stateRevision, '2');
      assert.equal(state.lastMovementId, movement.id);
    }
    assert.ok('changeSet' in receipt);
    assert.equal(receipt.changeSet.upserts.sales.length, 1);
    assert.equal(
      receipt.changeSet.upserts.products.length +
        receipt.changeSet.upserts.saleItems.length +
        receipt.changeSet.upserts.purchases.length +
        receipt.changeSet.upserts.stockAdjustments.length +
        receipt.changeSet.tombstones.length,
      0,
    );
    assert.equal(
      BigInt(result.committedRevision),
      BigInt(before.revision) + 1n,
    );
    assert.deepEqual(
      (await f.pool.query('SELECT * FROM sale_items')).rows,
      items,
    );
    assert.deepEqual(
      (
        await f.pool.query(
          "SELECT * FROM inventory_movements WHERE type='SALE' ORDER BY product_id",
        )
      ).rows,
      originals,
    );
    assert.deepEqual(
      (await f.pool.query('SELECT * FROM products')).rows,
      products,
    );
    const afterSale = (await f.pool.query('SELECT * FROM sales')).rows[0];
    assert.deepEqual(
      {
        ...afterSale,
        status: beforeSale.status,
        updated_at: beforeSale.updated_at,
      },
      beforeSale,
    );
    assert.equal(
      (
        await f.pool.query(
          "SELECT count(*) FROM inventory_movements WHERE type='REVERSAL' AND reversal_of_movement_id=source_id",
        )
      ).rows[0].count,
      String(count),
    );
  });
test('archived products do not prevent eligible historical reversal', async (t) => {
  const f = await voidSalesFixture(t),
    sale = await f.sale(2);
  await f.pool.query('UPDATE products SET is_archived=true');
  const command = await f.command(sale.payload.saleId);
  assert.equal((await f.result(await f.run(command), command)).kind, 'VOIDED');
  assert.equal(
    (await f.pool.query('SELECT count(*) FROM products WHERE is_archived'))
      .rows[0].count,
    '2',
  );
});
test('Cloud same key replays VOIDED; distinct stale rejects409; distinct current already-voided rejects422 without no-op commit', async (t) => {
  const f = await voidSalesFixture(t),
    sale = await f.sale(),
    a = await f.command(sale.payload.saleId),
    b = await f.command(sale.payload.saleId),
    accepted = await f.run(a),
    original = await f.result(accepted, a),
    afterA = await f.counts(f.context);
  assert.deepEqual(await f.result(await f.run(a), a), original);
  assert.deepEqual(await f.counts(f.context), afterA);
  const stale = await f.run(b);
  assert.equal(stale.status, 'CONFLICT');
  assert.ok('error' in stale);
  assert.equal(stale.error.code, 'REVISION_CONFLICT');
  assert.deepEqual(await f.run(b), stale);
  const c = await f.command(sale.payload.saleId),
    rejected = await f.run(c);
  assert.equal(rejected.status, 'REJECTED');
  assert.ok('error' in rejected);
  assert.equal(rejected.error.code, 'VOID_NOT_ELIGIBLE');
  assert.deepEqual(await f.run(c), rejected);
  const after = await f.counts(f.context);
  assert.equal(after.revision, afterA.revision);
  assert.equal(after.changes, afterA.changes);
  assert.equal(BigInt(after.receipts), BigInt(afterA.receipts) + 2n);
  assert.equal(
    (
      await f.pool.query(
        "SELECT count(*) FROM inventory_movements WHERE type='REVERSAL'",
      )
    ).rows[0].count,
    '1',
  );
});
