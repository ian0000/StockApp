import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adjustmentsFixture } from './helpers.js';
import { reconstructAdjustmentResult } from '../../src/adjustments/results.js';
import { id } from '../postgres/helpers.js';

test('historical adjustment replay survives changed state, archived product, lost ACK and hash mismatch', async (t) => {
  const f = await adjustmentsFixture(t),
    product = await f.product(),
    command = await f.command(product),
    original = reconstructAdjustmentResult(await f.run(command), command);
  await f.runPurchase(await f.purchaseCommand(product, 2, '14000000'));
  await f.pool.query('UPDATE products SET is_archived=true WHERE id=$1', [
    product,
  ]);
  const before = await f.counts(f.context),
    states = (await f.pool.query('SELECT * FROM inventory_states')).rows;
  assert.deepEqual(
    reconstructAdjustmentResult(await f.run(command), command),
    original,
  );
  await assert.rejects(
    () =>
      f.run({ ...command, payload: { ...command.payload, actualStock: 31 } }),
    { statusCode: 409, code: 'IDEMPOTENCY_KEY_REUSED' },
  );
  assert.deepEqual(await f.counts(f.context), before);
  assert.deepEqual(
    (await f.pool.query('SELECT * FROM inventory_states')).rows,
    states,
  );
});
for (const corruption of [
  'missing-adjustment',
  'duplicate-adjustment',
  'missing-movement',
  'duplicate-movement',
  'missing-state',
  'duplicate-state',
  'unexpected-product',
  'unexpected-sale',
  'adjustment-id',
  'adjustment-product',
  'adjustment-before',
  'adjustment-actual',
  'adjustment-difference',
  'adjustment-cost',
  'adjustment-reason',
  'adjustment-mode',
  'adjustment-time',
  'movement-id',
  'movement-type',
  'movement-source',
  'movement-cost',
  'movement-stock',
  'movement-time',
  'state-cost',
  'state-stock',
  'state-revision',
  'state-movement',
])
  test(`corrupt durable adjustment fails closed: ${corruption}`, async (t) => {
    const f = await adjustmentsFixture(t),
      product = await f.product(),
      command = await f.command(product),
      receipt = await f.run(command);
    assert.ok('changeSet' in receipt);
    const revision = receipt.changeSet.revision,
      changes = (
        await f.pool.query(
          'SELECT changes FROM inventory_change_sets WHERE inventory_id=$1 AND revision=$2',
          [f.context.inventory.id, revision],
        )
      ).rows[0].changes,
      up = changes.upserts,
      adjustment = up.stockAdjustments[0],
      movement = up.inventoryMovements[0],
      state = up.inventoryStates[0];
    switch (corruption) {
      case 'missing-adjustment':
        up.stockAdjustments = [];
        break;
      case 'duplicate-adjustment':
        up.stockAdjustments.push(adjustment);
        break;
      case 'missing-movement':
        up.inventoryMovements = [];
        break;
      case 'duplicate-movement':
        up.inventoryMovements.push(movement);
        break;
      case 'missing-state':
        up.inventoryStates = [];
        break;
      case 'duplicate-state':
        up.inventoryStates.push(state);
        break;
      case 'unexpected-product':
        up.products = [{ id: id() }];
        break;
      case 'unexpected-sale':
        up.sales = [{ id: id() }];
        break;
      case 'adjustment-id':
        adjustment.id = id();
        break;
      case 'adjustment-product':
        adjustment.productId = id();
        break;
      case 'adjustment-before':
        adjustment.stockBefore = 19;
        break;
      case 'adjustment-actual':
        adjustment.actualStock = 31;
        break;
      case 'adjustment-difference':
        adjustment.difference = 11;
        break;
      case 'adjustment-cost':
        adjustment.unitCost = '12000001';
        break;
      case 'adjustment-reason':
        adjustment.reason = 'OTHER';
        break;
      case 'adjustment-mode':
        adjustment.costMode = 'USE_CURRENT_COST';
        break;
      case 'adjustment-time':
        adjustment.createdAt = 457;
        break;
      case 'movement-id':
        movement.id = id();
        break;
      case 'movement-type':
        movement.type = 'ADJUSTMENT_OUT';
        break;
      case 'movement-source':
        movement.sourceId = id();
        break;
      case 'movement-cost':
        movement.unitCostSnapshot = '12000001';
        break;
      case 'movement-stock':
        movement.stockAfter = 31;
        break;
      case 'movement-time':
        movement.effectiveAt = 124;
        break;
      case 'state-cost':
        state.unitCost = '10666668';
        break;
      case 'state-stock':
        state.stock = 31;
        break;
      case 'state-revision':
        state.stateRevision = '2';
        break;
      case 'state-movement':
        state.lastMovementId = id();
        break;
    }
    await f.pool.query(
      'UPDATE inventory_change_sets SET changes=$1 WHERE inventory_id=$2 AND revision=$3',
      [changes, f.context.inventory.id, revision],
    );
    const before = await f.counts(f.context),
      states = (await f.pool.query('SELECT * FROM inventory_states')).rows;
    await assert.rejects(async () =>
      reconstructAdjustmentResult(await f.run(command), command),
    );
    assert.deepEqual(await f.counts(f.context), before);
    assert.deepEqual(
      (await f.pool.query('SELECT * FROM inventory_states')).rows,
      states,
    );
  });
