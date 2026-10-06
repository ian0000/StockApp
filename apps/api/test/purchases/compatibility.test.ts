import assert from 'node:assert/strict';
import { test } from 'node:test';
import { purchasesFixture } from './helpers.js';
import { reconstructPurchaseResult } from '../../src/purchases/results.js';

for (const notes of [null, '', '   ', '  Fictional\n internal  content  '])
  test(`Purchase notes preserve Domain normalization: ${JSON.stringify(notes)}`, async (t) => {
    const f = await purchasesFixture(t),
      productId = await f.product(),
      command = await f.command(productId);
    command.payload.notes = notes;
    const result = reconstructPurchaseResult(await f.run(command), command);
    assert.equal(result.purchase.notes, notes?.trim() || null);
  });
test('UUID equality preserves v4 Inventory/Product references and uppercase lastMovementId with fresh v7 identities', async (t) => {
  const f = await purchasesFixture(t),
    inventoryId = '550e8400-e29b-41d4-a716-446655440001',
    productId = '550e8400-e29b-41d4-a716-446655440000';
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
    'INSERT INTO inventory_states(inventory_id,product_id,stock,unit_cost_units)VALUES($1,$2,0,0)',
    [inventoryId, productId],
  );
  const first = await f.command(productId, 1, '0');
  first.payload.productId = productId.toUpperCase();
  first.payload.purchaseId = first.payload.purchaseId.toUpperCase();
  first.payload.movementId = first.payload.movementId.toUpperCase();
  const result = reconstructPurchaseResult(await f.run(first), first);
  assert.equal(result.product.id, productId);
  assert.equal(result.purchase.id, first.payload.purchaseId.toLowerCase());
  assert.equal(result.afterState.unitCost, '0');
  const next = await f.command(productId, 1, '0');
  next.preconditions.expectedState.lastMovementId =
    result.movement.id.toUpperCase();
  const subsequent = reconstructPurchaseResult(await f.run(next), next);
  assert.equal(subsequent.beforeState.lastMovementId, result.movement.id);
  assert.equal(subsequent.afterState.stateRevision, '2');
});
