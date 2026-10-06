import assert from 'node:assert/strict';
import { test } from 'node:test';
import { voidPurchasesFixture } from './helpers.js';
import { id } from '../postgres/helpers.js';

test('durable Purchase void replay survives later stock/cost/metadata/archival and hash mismatch', async (t) => {
  const f = await voidPurchasesFixture(t),
    purchase = await f.purchase(),
    command = await f.command(purchase.payload.purchaseId),
    original = await f.result(await f.run(command), command),
    next = await f.purchaseCommand(purchase.payload.productId, 1, '17000000');
  next.occurredAt = 2100;
  next.payload.createdAt = 2200;
  await f.runPurchase(next);
  await f.pool.query(
    'UPDATE products SET is_archived=true,regular_sale_price_units=19000000',
  );
  const before = await f.counts(f.context),
    states = (await f.pool.query('SELECT * FROM inventory_states')).rows;
  assert.deepEqual(await f.result(await f.run(command), command), original);
  await assert.rejects(() => f.run({ ...command, occurredAt: 1501 }), {
    statusCode: 409,
    code: 'IDEMPOTENCY_KEY_REUSED',
  });
  assert.deepEqual(await f.counts(f.context), before);
  assert.deepEqual(
    (await f.pool.query('SELECT * FROM inventory_states')).rows,
    states,
  );
});

for (const corruption of [
  'missing-purchase',
  'duplicate-purchase',
  'purchase-id',
  'purchase-status',
  'purchase-quantity',
  'purchase-before-cost',
  'purchase-after-cost',
  'purchase-unit-cost',
  'missing-reversal',
  'duplicate-reversal',
  'missing-state',
  'duplicate-state',
  'state-stock',
  'state-cost',
  'state-revision',
  'state-pointer',
  'movement-id',
  'movement-product',
  'movement-type',
  'movement-source',
  'movement-pointer',
  'movement-cost',
  'movement-quantity',
  'movement-stock',
  'movement-time',
  'unexpected-product',
  'unexpected-sale',
  'unexpected-item',
  'unexpected-adjustment',
])
  test(`durable Purchase void corruption fails closed: ${corruption}`, async (t) => {
    const f = await voidPurchasesFixture(t),
      purchase = await f.purchase(),
      command = await f.command(purchase.payload.purchaseId),
      receipt = await f.run(command);
    assert.ok('changeSet' in receipt);
    const revision = receipt.changeSet.revision,
      changes = (
        await f.pool.query(
          'SELECT changes FROM inventory_change_sets WHERE inventory_id=$1 AND revision=$2',
          [f.context.inventory.id, revision],
        )
      ).rows[0].changes,
      up = changes.upserts;
    switch (corruption) {
      case 'missing-purchase':
        up.purchases = [];
        break;
      case 'duplicate-purchase':
        up.purchases.push(up.purchases[0]);
        break;
      case 'purchase-id':
        up.purchases[0].id = id();
        break;
      case 'purchase-status':
        up.purchases[0].status = 'CONFIRMED';
        break;
      case 'purchase-quantity':
        up.purchases[0].quantity = 9;
        break;
      case 'purchase-before-cost':
        up.purchases[0].averageCostBefore = '10000001';
        break;
      case 'purchase-after-cost':
        up.purchases[0].averageCostAfter = '10666668';
        break;
      case 'purchase-unit-cost':
        up.purchases[0].unitCost = '12000001';
        break;
      case 'missing-reversal':
        up.inventoryMovements = [];
        break;
      case 'duplicate-reversal':
        up.inventoryMovements.push(up.inventoryMovements[0]);
        break;
      case 'missing-state':
        up.inventoryStates = [];
        break;
      case 'duplicate-state':
        up.inventoryStates.push(up.inventoryStates[0]);
        break;
      case 'state-stock':
        up.inventoryStates[0].stock = 21;
        break;
      case 'state-cost':
        up.inventoryStates[0].unitCost = '12000000';
        break;
      case 'state-revision':
        up.inventoryStates[0].stateRevision = '3';
        break;
      case 'state-pointer':
        up.inventoryStates[0].lastMovementId = id();
        break;
      case 'movement-id':
        up.inventoryMovements[0].id = id();
        break;
      case 'movement-product':
        up.inventoryMovements[0].productId = id();
        break;
      case 'movement-type':
        up.inventoryMovements[0].type = 'PURCHASE';
        break;
      case 'movement-source':
        up.inventoryMovements[0].sourceId = id();
        break;
      case 'movement-pointer':
        up.inventoryMovements[0].reversalOfMovementId = id();
        break;
      case 'movement-cost':
        up.inventoryMovements[0].unitCostSnapshot = '10000000';
        break;
      case 'movement-quantity':
        up.inventoryMovements[0].quantityDelta = -9;
        break;
      case 'movement-stock':
        up.inventoryMovements[0].stockAfter = 21;
        break;
      case 'movement-time':
        up.inventoryMovements[0].effectiveAt = 1501;
        break;
      case 'unexpected-product':
        up.products = [{ id: id() }];
        break;
      case 'unexpected-sale':
        up.sales = [{ id: id() }];
        break;
      case 'unexpected-item':
        up.saleItems = [{ id: id() }];
        break;
      case 'unexpected-adjustment':
        up.stockAdjustments = [{ id: id() }];
        break;
    }
    await f.pool.query(
      'UPDATE inventory_change_sets SET changes=$1 WHERE inventory_id=$2 AND revision=$3',
      [changes, f.context.inventory.id, revision],
    );
    const before = await f.counts(f.context),
      states = (await f.pool.query('SELECT * FROM inventory_states')).rows;
    await assert.rejects(async () => f.result(await f.run(command), command));
    assert.deepEqual(await f.counts(f.context), before);
    assert.deepEqual(
      (await f.pool.query('SELECT * FROM inventory_states')).rows,
      states,
    );
  });

test('legacy UUIDv4 Purchase/Inventory/Product/original movement references preserve identities with new v7 reversal', async (t) => {
  const f = await voidPurchasesFixture(t),
    inventoryId = '550e8400-e29b-41d4-a716-446655440011',
    productId = '550e8400-e29b-41d4-a716-446655440012',
    purchaseId = '550e8400-e29b-41d4-a716-446655440013',
    originalId = '550e8400-e29b-41d4-a716-446655440014';
  await f.pool.query('UPDATE inventories SET id=$1 WHERE id=$2', [
    inventoryId,
    f.context.inventory.id,
  ]);
  f.context.inventory.id = inventoryId;
  await f.pool.query(
    "INSERT INTO products(id,inventory_id,name,regular_sale_price_units,created_at,updated_at)VALUES($1,$2,'Legacy',15000000,100,100)",
    [productId, inventoryId],
  );
  await f.pool.query(
    "INSERT INTO purchases(id,inventory_id,product_id,status,quantity,unit_cost_units,total_amount_units,stock_before,stock_after,average_cost_before_units,average_cost_after_units,effective_at,created_at,updated_at)VALUES($1,$2,$3,'CONFIRMED',10,12000000,120000000,0,10,NULL,12000000,900,1000,1000)",
    [purchaseId, inventoryId, productId],
  );
  await f.pool.query(
    "INSERT INTO inventory_movements(id,inventory_id,product_id,type,quantity_delta,unit_cost_snapshot_units,stock_before,stock_after,source_type,source_id,effective_at,created_at,updated_at)VALUES($1,$2,$3,'PURCHASE',10,12000000,0,10,'PURCHASE',$4,900,1000,1000)",
    [originalId, inventoryId, productId, purchaseId],
  );
  await f.pool.query(
    'INSERT INTO inventory_states(inventory_id,product_id,stock,unit_cost_units,state_revision,last_movement_id)VALUES($1,$2,10,12000000,7,$3)',
    [inventoryId, productId, originalId],
  );
  const command = await f.command(purchaseId);
  command.payload.purchaseId = purchaseId.toUpperCase();
  command.payload.reversalMovementId =
    command.payload.reversalMovementId.toUpperCase();
  command.preconditions.expectedState.lastMovementId = originalId.toUpperCase();
  const result = await f.result(await f.run(command), command);
  assert.equal(result.purchase.id, purchaseId);
  assert.equal(result.states[0].unitCost, null);
  assert.equal(result.states[0].stateRevision, '8');
  assert.equal(result.reversals[0].reversalOfMovementId, originalId);
});
