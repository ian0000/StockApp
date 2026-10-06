import assert from 'node:assert/strict';
import { test } from 'node:test';
import { voidSalesFixture } from './helpers.js';
import { id } from '../postgres/helpers.js';
import { saleCommand } from '../sales/helpers.js';

test('durable Void replay survives later canonical Sale/cost/stock/archived changes and hash mismatch', async (t) => {
  const f = await voidSalesFixture(t),
    sale = await f.sale(2),
    command = await f.command(sale.payload.saleId),
    original = await f.result(await f.run(command), command),
    product = sale.payload.items[0].productId;
  const next = saleCommand([
    {
      productId: product,
      quantity: 1,
      price: '15000000',
      cost: '5000000',
      estimatedCost: '5000000',
      estimatedProfit: '10000000',
    },
  ]);
  next.occurredAt = 2100;
  next.payload.createdAt = 2200;
  await f.runSale(next);
  await f.pool.query(
    'UPDATE products SET is_archived=true,regular_sale_price_units=19000000',
  );
  await f.pool.query(
    'UPDATE inventory_states SET unit_cost_units=7000000 WHERE product_id=$1',
    [product],
  );
  const before = await f.counts(f.context),
    states = (
      await f.pool.query('SELECT * FROM inventory_states ORDER BY product_id')
    ).rows;
  assert.deepEqual(await f.result(await f.run(command), command), original);
  await assert.rejects(
    () => f.run({ ...command, occurredAt: command.occurredAt + 1 }),
    { statusCode: 409, code: 'IDEMPOTENCY_KEY_REUSED' },
  );
  assert.deepEqual(await f.counts(f.context), before);
  assert.deepEqual(
    (await f.pool.query('SELECT * FROM inventory_states ORDER BY product_id'))
      .rows,
    states,
  );
});
for (const corruption of [
  'missing-sale',
  'duplicate-sale',
  'sale-id',
  'sale-status',
  'sale-profit',
  'missing-reversal',
  'duplicate-reversal',
  'extra-state',
  'missing-state',
  'state-stock',
  'state-cost',
  'state-revision',
  'state-pointer',
  'reversal-id',
  'reversal-product',
  'reversal-kind',
  'reversal-source',
  'reversal-pointer',
  'reversal-delta',
  'reversal-cost',
  'reversal-stock',
  'reversal-time',
  'unexpected-product',
  'unexpected-item',
  'unexpected-purchase',
  'unexpected-adjustment',
])
  test(`durable Void corruption fails closed: ${corruption}`, async (t) => {
    const f = await voidSalesFixture(t),
      sale = await f.sale(2),
      command = await f.command(sale.payload.saleId),
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
      case 'missing-sale':
        up.sales = [];
        break;
      case 'duplicate-sale':
        up.sales.push(up.sales[0]);
        break;
      case 'sale-id':
        up.sales[0].id = id();
        break;
      case 'sale-status':
        up.sales[0].status = 'CONFIRMED';
        break;
      case 'sale-profit':
        up.sales[0].estimatedProfit = '1';
        break;
      case 'missing-reversal':
        up.inventoryMovements.pop();
        break;
      case 'duplicate-reversal':
        up.inventoryMovements[1] = up.inventoryMovements[0];
        break;
      case 'extra-state':
        up.inventoryStates.push(up.inventoryStates[0]);
        break;
      case 'missing-state':
        up.inventoryStates.pop();
        break;
      case 'state-stock':
        up.inventoryStates[0].stock = 9;
        break;
      case 'state-cost':
        up.inventoryStates[0].unitCost = '5000001';
        break;
      case 'state-revision':
        up.inventoryStates[0].stateRevision = '3';
        break;
      case 'state-pointer':
        up.inventoryStates[0].lastMovementId = id();
        break;
      case 'reversal-id':
        up.inventoryMovements[0].id = id();
        break;
      case 'reversal-product':
        up.inventoryMovements[0].productId = id();
        break;
      case 'reversal-kind':
        up.inventoryMovements[0].type = 'ADJUSTMENT_IN';
        break;
      case 'reversal-source':
        up.inventoryMovements[0].sourceId = id();
        break;
      case 'reversal-pointer':
        up.inventoryMovements[0].reversalOfMovementId = id();
        break;
      case 'reversal-delta':
        up.inventoryMovements[0].quantityDelta = 1;
        break;
      case 'reversal-cost':
        up.inventoryMovements[0].unitCostSnapshot = '5000001';
        break;
      case 'reversal-stock':
        up.inventoryMovements[0].stockAfter = 9;
        break;
      case 'reversal-time':
        up.inventoryMovements[0].effectiveAt = 1501;
        break;
      case 'unexpected-product':
        up.products = [{ id: id() }];
        break;
      case 'unexpected-item':
        up.saleItems = [{ id: id() }];
        break;
      case 'unexpected-purchase':
        up.purchases = [{ id: id() }];
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
      states = (
        await f.pool.query('SELECT * FROM inventory_states ORDER BY product_id')
      ).rows;
    await assert.rejects(async () => f.result(await f.run(command), command));
    assert.deepEqual(await f.counts(f.context), before);
    assert.deepEqual(
      (await f.pool.query('SELECT * FROM inventory_states ORDER BY product_id'))
        .rows,
      states,
    );
  });
test('UUIDv4 Sale/Product/Inventory references and uppercase evidence preserve historical identities', async (t) => {
  const f = await voidSalesFixture(t),
    inventoryId = '550e8400-e29b-41d4-a716-446655440001',
    productId = '550e8400-e29b-41d4-a716-446655440002',
    saleId = '550e8400-e29b-41d4-a716-446655440003';
  await f.pool.query('UPDATE inventories SET id=$1 WHERE id=$2', [
    inventoryId,
    f.context.inventory.id,
  ]);
  f.context.inventory.id = inventoryId;
  await f.pool.query(
    "INSERT INTO products(id,inventory_id,name,regular_sale_price_units,created_at,updated_at)VALUES($1,$2,'Legacy',15000000,100,100)",
    [productId, inventoryId],
  );
  const originalId = '550e8400-e29b-41d4-a716-446655440004';
  await f.pool.query(
    "INSERT INTO sales(id,inventory_id,status,total_amount_units,effective_at,created_at,updated_at)VALUES($1,$2,'CONFIRMED',15000000,900,1000,1000)",
    [saleId, inventoryId],
  );
  await f.pool.query(
    "INSERT INTO sale_items(id,inventory_id,sale_id,product_id,quantity,unit_sale_price_units,subtotal_units,cost_status,created_at,updated_at)VALUES($1,$2,$3,$4,1,15000000,15000000,'UNKNOWN',1000,1000)",
    [id(), inventoryId, saleId, productId],
  );
  await f.pool.query(
    "INSERT INTO inventory_movements(id,inventory_id,product_id,type,quantity_delta,stock_before,stock_after,source_type,source_id,effective_at,created_at,updated_at)VALUES($1,$2,$3,'SALE',-1,0,-1,'SALE',$4,900,1000,1000)",
    [originalId, inventoryId, productId, saleId],
  );
  await f.pool.query(
    'INSERT INTO inventory_states(inventory_id,product_id,stock,unit_cost_units,state_revision,last_movement_id)VALUES($1,$2,-1,NULL,7,$3)',
    [inventoryId, productId, originalId],
  );
  const command = await f.command(saleId);
  command.payload.saleId = saleId.toUpperCase();
  command.payload.reversalMovements[0].productId = productId.toUpperCase();
  command.payload.reversalMovements[0].movementId =
    command.payload.reversalMovements[0].movementId.toUpperCase();
  command.preconditions.states[0].productId = productId.toUpperCase();
  command.preconditions.states[0].expectedState.lastMovementId =
    command.preconditions.states[0].expectedState.lastMovementId?.toUpperCase() ??
    null;
  const result = await f.result(await f.run(command), command);
  assert.equal(result.sale.id, saleId);
  assert.equal(result.reversals[0].productId, productId);
  assert.equal(result.states[0].unitCost, null);
});
