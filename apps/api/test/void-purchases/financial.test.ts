import assert from 'node:assert/strict';
import { test } from 'node:test';
import { voidPurchasesFixture } from './helpers.js';

for (const [stock, beforeCost, quantity, incomingCost, afterCost] of [
  [20, '10000000', 10, '12000000', '10666667'],
  [0, null, 10, '12000000', '12000000'],
  [-5, null, 3, '12000000', '12000000'],
  [-5, '7000000', 10, '12000000', '12000000'],
  [0, '5000000', 1, '0', '0'],
  [10, '0', 2, '0', '0'],
] as const)
  test(`VoidPurchase restores stock ${stock}/cost ${beforeCost}; reversal keeps incoming ${incomingCost}`, async (t) => {
    const f = await voidPurchasesFixture(t),
      purchase = await f.purchase(stock, beforeCost, quantity, incomingCost),
      command = await f.command(purchase.payload.purchaseId),
      before = await f.counts(f.context),
      originalPurchase = (await f.pool.query('SELECT * FROM purchases'))
        .rows[0],
      originalMovements = (
        await f.pool.query(
          "SELECT * FROM inventory_movements WHERE type='PURCHASE'",
        )
      ).rows,
      products = (await f.pool.query('SELECT * FROM products')).rows;
    assert.equal(command.preconditions.expectedState.unitCost, afterCost);
    const receipt = await f.run(command),
      result = await f.result(receipt, command);
    assert.equal(result.kind, 'VOIDED');
    assert.equal(result.purchase.status, 'VOIDED');
    assert.equal(result.purchase.updatedAt, 2000);
    assert.equal(result.purchase.averageCostBefore, beforeCost);
    assert.equal(result.purchase.averageCostAfter, afterCost);
    assert.equal(result.purchase.unitCost, incomingCost);
    assert.equal(result.states.length, 1);
    assert.equal(result.reversals.length, 1);
    const state = result.states[0],
      movement = result.reversals[0];
    assert.equal(state.stock, stock);
    assert.equal(state.unitCost, beforeCost);
    assert.equal(state.stateRevision, '2');
    assert.equal(state.lastMovementId, command.payload.reversalMovementId);
    assert.equal(movement.type, 'REVERSAL');
    assert.equal(movement.quantityDelta, -quantity);
    assert.equal(movement.stockBefore, stock + quantity);
    assert.equal(movement.stockAfter, stock);
    assert.equal(movement.unitCostSnapshot, incomingCost);
    assert.equal(movement.sourceType, 'INVENTORY_MOVEMENT');
    assert.equal(movement.sourceId, purchase.payload.movementId);
    assert.equal(movement.reversalOfMovementId, purchase.payload.movementId);
    assert.equal(movement.metadata, null);
    assert.equal(movement.effectiveAt, 1500);
    assert.equal(movement.createdAt, 1600);
    assert.equal(movement.updatedAt, 1600);
    assert.ok('changeSet' in receipt);
    const up = receipt.changeSet.upserts;
    assert.equal(up.purchases.length, 1);
    assert.equal(
      up.products.length +
        up.sales.length +
        up.saleItems.length +
        up.stockAdjustments.length +
        receipt.changeSet.tombstones.length,
      0,
    );
    assert.equal(
      BigInt(result.committedRevision),
      BigInt(before.revision) + 1n,
    );
    const afterPurchase = (await f.pool.query('SELECT * FROM purchases'))
      .rows[0];
    assert.deepEqual(
      {
        ...afterPurchase,
        status: originalPurchase.status,
        updated_at: originalPurchase.updated_at,
      },
      originalPurchase,
    );
    assert.deepEqual(
      (
        await f.pool.query(
          "SELECT * FROM inventory_movements WHERE type='PURCHASE'",
        )
      ).rows,
      originalMovements,
    );
    assert.deepEqual(
      (await f.pool.query('SELECT * FROM products')).rows,
      products,
    );
  });

test('archived Product permits an eligible historical Purchase void', async (t) => {
  const f = await voidPurchasesFixture(t),
    purchase = await f.purchase();
  await f.pool.query('UPDATE products SET is_archived=true');
  const command = await f.command(purchase.payload.purchaseId);
  assert.equal((await f.result(await f.run(command), command)).kind, 'VOIDED');
  assert.equal(
    (await f.pool.query('SELECT is_archived FROM products')).rows[0]
      .is_archived,
    true,
  );
});

test('Cloud Purchase void same key replays; distinct stale409/current already-VOIDED422 have no accepted no-op', async (t) => {
  const f = await voidPurchasesFixture(t),
    purchase = await f.purchase(),
    a = await f.command(purchase.payload.purchaseId),
    b = await f.command(purchase.payload.purchaseId),
    original = await f.result(await f.run(a), a),
    after = await f.counts(f.context);
  assert.deepEqual(await f.result(await f.run(a), a), original);
  assert.deepEqual(await f.counts(f.context), after);
  const stale = await f.run(b);
  assert.equal(stale.status, 'CONFLICT');
  assert.ok('error' in stale);
  assert.equal(stale.error.code, 'REVISION_CONFLICT');
  assert.deepEqual(await f.run(b), stale);
  const current = await f.command(purchase.payload.purchaseId),
    rejected = await f.run(current);
  assert.equal(rejected.status, 'REJECTED');
  assert.ok('error' in rejected);
  assert.equal(rejected.error.code, 'VOID_NOT_ELIGIBLE');
  assert.deepEqual(await f.run(current), rejected);
  const final = await f.counts(f.context);
  assert.equal(final.revision, after.revision);
  assert.equal(final.changes, after.changes);
  assert.equal(BigInt(final.receipts), BigInt(after.receipts) + 2n);
  assert.equal(
    (
      await f.pool.query(
        "SELECT count(*) FROM inventory_movements WHERE type='REVERSAL'",
      )
    ).rows[0].count,
    '1',
  );
});
