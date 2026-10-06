import assert from 'node:assert/strict';
import { test } from 'node:test';
import { purchasesFixture } from './helpers.js';
import { reconstructPurchaseResult } from '../../src/purchases/results.js';
import { executeProductCommand } from '../../src/products/execute.js';
import { updateCommand } from '../products/helpers.js';
import { id } from '../postgres/helpers.js';

test('Purchase replay uses historical Product/States/analysis despite later metadata, cost, stock and archived state', async (t) => {
  const f = await purchasesFixture(t),
    productId = await f.product(),
    command = await f.command(productId),
    original = reconstructPurchaseResult(await f.run(command), command);
  const update = updateCommand(productId, '0', {
    regularSalePrice: '20000000',
  });
  await f.execute(
    f.input(f.context, update, (tx, inventory) =>
      executeProductCommand(tx, inventory.id, update),
    ),
  );
  await f.run(await f.command(productId, 2, '14000000'));
  await f.pool.query('UPDATE products SET is_archived=true WHERE id=$1', [
    productId,
  ]);
  const before = await f.counts(f.context),
    states = (await f.pool.query('SELECT * FROM inventory_states')).rows;
  assert.deepEqual(
    reconstructPurchaseResult(await f.run(command), command),
    original,
  );
  assert.equal(original.product.regularSalePrice, '15000000');
  assert.equal(original.priceAnalysis.regularSalePrice, '15000000');
  assert.equal(original.afterState.stock, 30);
  await assert.rejects(
    () =>
      f.run({ ...command, payload: { ...command.payload, notes: 'Changed' } }),
    { statusCode: 409, code: 'IDEMPOTENCY_KEY_REUSED' },
  );
  assert.deepEqual(await f.counts(f.context), before);
  assert.deepEqual(
    (await f.pool.query('SELECT * FROM inventory_states')).rows,
    states,
  );
});
for (const corruption of [
  'missing-product',
  'duplicate-product',
  'missing-purchase',
  'duplicate-purchase',
  'missing-movement',
  'duplicate-movement',
  'missing-state',
  'duplicate-state',
  'unexpected-sale',
  'product-id',
  'product-archived',
  'product-revision',
  'purchase-id',
  'purchase-product',
  'purchase-quantity',
  'purchase-unit-cost',
  'purchase-total',
  'purchase-before-cost',
  'purchase-average',
  'purchase-before-stock',
  'purchase-after-stock',
  'purchase-notes',
  'purchase-time',
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
  test(`durable Purchase ChangeSet corruption fails closed: ${corruption}`, async (t) => {
    const f = await purchasesFixture(t),
      productId = await f.product(),
      command = await f.command(productId),
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
      case 'missing-product':
        up.products = [];
        break;
      case 'duplicate-product':
        up.products.push(up.products[0]);
        break;
      case 'missing-purchase':
        up.purchases = [];
        break;
      case 'duplicate-purchase':
        up.purchases.push(up.purchases[0]);
        break;
      case 'missing-movement':
        up.inventoryMovements = [];
        break;
      case 'duplicate-movement':
        up.inventoryMovements.push(up.inventoryMovements[0]);
        break;
      case 'missing-state':
        up.inventoryStates = [];
        break;
      case 'duplicate-state':
        up.inventoryStates.push(up.inventoryStates[0]);
        break;
      case 'unexpected-sale':
        up.sales = [{ id: id() }];
        break;
      case 'product-id':
        up.products[0].id = id();
        break;
      case 'product-archived':
        up.products[0].isArchived = true;
        break;
      case 'product-revision':
        up.products[0].metadataRevision = '9223372036854775808';
        break;
      case 'purchase-id':
        up.purchases[0].id = id();
        break;
      case 'purchase-product':
        up.purchases[0].productId = id();
        break;
      case 'purchase-quantity':
        up.purchases[0].quantity = 11;
        break;
      case 'purchase-unit-cost':
        up.purchases[0].unitCost = '1';
        break;
      case 'purchase-total':
        up.purchases[0].totalAmount = '1';
        break;
      case 'purchase-before-cost':
        up.purchases[0].averageCostBefore = '0';
        break;
      case 'purchase-average':
        up.purchases[0].averageCostAfter = '10666668';
        break;
      case 'purchase-before-stock':
        up.purchases[0].stockBefore = 19;
        break;
      case 'purchase-after-stock':
        up.purchases[0].stockAfter = 29;
        break;
      case 'purchase-notes':
        up.purchases[0].notes = 'Changed';
        break;
      case 'purchase-time':
        up.purchases[0].createdAt = 1;
        break;
      case 'movement-type':
        up.inventoryMovements[0].type = 'SALE';
        break;
      case 'movement-source':
        up.inventoryMovements[0].sourceId = id();
        break;
      case 'movement-cost':
        up.inventoryMovements[0].unitCostSnapshot = '10666667';
        break;
      case 'movement-stock':
        up.inventoryMovements[0].stockBefore = 19;
        break;
      case 'movement-time':
        up.inventoryMovements[0].effectiveAt = 1;
        break;
      case 'state-cost':
        up.inventoryStates[0].unitCost = '12000000';
        break;
      case 'state-stock':
        up.inventoryStates[0].stock = 29;
        break;
      case 'state-revision':
        up.inventoryStates[0].stateRevision = '2';
        break;
      case 'state-movement':
        up.inventoryStates[0].lastMovementId = id();
        break;
    }
    const before = await f.counts(f.context),
      states = (await f.pool.query('SELECT * FROM inventory_states')).rows;
    await f.pool.query(
      'UPDATE inventory_change_sets SET changes=$1 WHERE inventory_id=$2 AND revision=$3',
      [changes, f.context.inventory.id, revision],
    );
    await assert.rejects(async () =>
      reconstructPurchaseResult(await f.run(command), command),
    );
    assert.deepEqual(await f.counts(f.context), before);
    assert.deepEqual(
      (await f.pool.query('SELECT * FROM inventory_states')).rows,
      states,
    );
    assert.equal(
      (await f.pool.query('SELECT count(*) FROM purchases')).rows[0].count,
      '1',
    );
  });
