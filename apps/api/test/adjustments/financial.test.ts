import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adjustmentsFixture } from './helpers.js';
import { reconstructAdjustmentResult } from '../../src/adjustments/results.js';

for (const [stock, beforeCost, actual, mode, custom, afterCost, resolved] of [
  [20, '10000000', 30, 'CUSTOM_COST', '12000000', '10666667', '12000000'],
  [20, '10000000', 30, 'USE_CURRENT_COST', null, '10000000', '10000000'],
  [20, '0', 30, 'USE_CURRENT_COST', null, '0', '0'],
  [20, '10000000', 30, 'CUSTOM_COST', '0', '6666667', '0'],
  [20, '10000000', 18, null, null, '10000000', '10000000'],
  [20, '0', 0, null, null, '0', '0'],
  [0, null, 5, 'CUSTOM_COST', '12000000', '12000000', '12000000'],
  [0, '10000000', 5, 'CUSTOM_COST', '12000000', '12000000', '12000000'],
  [-10, null, 0, 'CUSTOM_COST', '12000000', '12000000', '12000000'],
  [-10, '10000000', 5, 'CUSTOM_COST', '12000000', '12000000', '12000000'],
  [-10, '0', 0, 'USE_CURRENT_COST', null, '0', '0'],
] as const)
  test(`Adjustment ${stock}@${beforeCost} -> ${actual}, ${mode}`, async (t) => {
    const f = await adjustmentsFixture(t),
      product = await f.product(stock, beforeCost),
      command = await f.command(product, actual, mode, custom),
      before = await f.counts(f.context),
      originalProducts = (await f.pool.query('SELECT * FROM products')).rows;
    const receipt = await f.run(command),
      result = reconstructAdjustmentResult(receipt, command);
    assert.equal(result.adjustment.stockBefore, stock);
    assert.equal(result.adjustment.actualStock, actual);
    assert.equal(result.adjustment.difference, actual - stock);
    assert.equal(result.adjustment.unitCost, resolved);
    assert.equal(result.adjustment.costMode, mode);
    assert.equal(result.adjustment.effectiveAt, 123);
    assert.equal(result.adjustment.createdAt, 456);
    assert.equal(result.adjustment.updatedAt, 456);
    assert.equal(result.state.stock, actual);
    assert.equal(result.state.unitCost, afterCost);
    assert.equal(result.state.stateRevision, '1');
    assert.equal(result.state.lastMovementId, command.payload.movementId);
    assert.equal(
      result.movement.type,
      actual > stock ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
    );
    assert.equal(result.movement.quantityDelta, actual - stock);
    assert.equal(result.movement.unitCostSnapshot, resolved);
    assert.equal(result.movement.sourceType, 'STOCK_ADJUSTMENT');
    assert.equal(result.movement.sourceId, result.adjustment.id);
    assert.equal(result.movement.metadata, null);
    assert.equal(result.movement.reversalOfMovementId, null);
    assert.equal(
      BigInt(result.committedRevision),
      BigInt(before.revision) + 1n,
    );
    assert.ok('changeSet' in receipt);
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(receipt.changeSet.upserts).map(([key, values]) => [
          key,
          values.length,
        ]),
      ),
      {
        products: 0,
        inventoryStates: 1,
        sales: 0,
        saleItems: 0,
        purchases: 0,
        stockAdjustments: 1,
        inventoryMovements: 1,
      },
    );
    assert.deepEqual(receipt.changeSet.tombstones, []);
    assert.deepEqual(
      (await f.pool.query('SELECT * FROM products')).rows,
      originalProducts,
    );
    const row = (await f.pool.query('SELECT * FROM stock_adjustments')).rows[0];
    assert.equal(row.difference, String(actual - stock));
    assert.equal(row.unit_cost_units, resolved);
  });

for (const [label, stock, cost, actual, mode, custom, reason] of [
  ['unknown current', 0, null, 1, 'USE_CURRENT_COST', null, 'COUNT_CORRECTION'],
  ['missing positive mode', 20, '10000000', 21, null, null, 'COUNT_CORRECTION'],
  [
    'current with custom',
    20,
    '10000000',
    21,
    'USE_CURRENT_COST',
    '10000000',
    'COUNT_CORRECTION',
  ],
  [
    'custom missing',
    20,
    '10000000',
    21,
    'CUSTOM_COST',
    null,
    'COUNT_CORRECTION',
  ],
  ['positive damaged', 20, '10000000', 21, 'CUSTOM_COST', '0', 'DAMAGED'],
  ['positive lost', 20, '10000000', 21, 'CUSTOM_COST', '0', 'LOST'],
  [
    'positive internal use',
    20,
    '10000000',
    21,
    'CUSTOM_COST',
    '0',
    'INTERNAL_USE',
  ],
  ['negative mode', 20, '10000000', 19, 'USE_CURRENT_COST', null, 'DAMAGED'],
  ['negative custom', 20, '10000000', 19, null, '0', 'LOST'],
  ['difference zero', 20, '10000000', 20, null, null, 'COUNT_CORRECTION'],
] as const)
  test(`Adjustment terminal domain rejection: ${label}`, async (t) => {
    const f = await adjustmentsFixture(t),
      product = await f.product(stock, cost),
      command = await f.command(product, actual, mode, custom);
    command.payload.reason = reason;
    const before = await f.counts(f.context),
      states = (await f.pool.query('SELECT * FROM inventory_states')).rows,
      movements = (await f.pool.query('SELECT * FROM inventory_movements'))
        .rows;
    const receipt = await f.run(command);
    assert.equal(receipt.status, 'REJECTED');
    assert.ok('error' in receipt);
    assert.equal(receipt.error.code, 'DOMAIN_RULE');
    assert.deepEqual(await f.run(command), receipt);
    const after = await f.counts(f.context);
    assert.equal(after.revision, before.revision);
    assert.equal(after.changes, before.changes);
    assert.equal(BigInt(after.receipts), BigInt(before.receipts) + 1n);
    assert.deepEqual(
      (await f.pool.query('SELECT * FROM inventory_states')).rows,
      states,
    );
    assert.deepEqual(
      (await f.pool.query('SELECT * FROM inventory_movements')).rows,
      movements,
    );
    assert.equal(
      (await f.pool.query('SELECT count(*) FROM stock_adjustments')).rows[0]
        .count,
      '0',
    );
  });
for (const reason of [
  'COUNT_CORRECTION',
  'DAMAGED',
  'LOST',
  'INTERNAL_USE',
  'OTHER',
] as const)
  test(`negative reason ${reason} is accepted`, async (t) => {
    const f = await adjustmentsFixture(t),
      product = await f.product(),
      command = await f.command(product, 0, null, null);
    command.payload.reason = reason;
    assert.equal(
      reconstructAdjustmentResult(await f.run(command), command).adjustment
        .reason,
      reason,
    );
  });
test('positive OTHER is accepted', async (t) => {
  const f = await adjustmentsFixture(t),
    product = await f.product(),
    command = await f.command(product);
  command.payload.reason = 'OTHER';
  assert.equal(
    reconstructAdjustmentResult(await f.run(command), command).adjustment
      .reason,
    'OTHER',
  );
});
