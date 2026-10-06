import assert from 'node:assert/strict';
import { test } from 'node:test';
import { voidPurchasesFixture, voidPurchaseCommand } from './helpers.js';
import { id } from '../postgres/helpers.js';
import { saleCommand } from '../sales/helpers.js';
import { executeSaleCommand } from '../../src/sales/execute.js';
import { adjustmentCommand } from '../adjustments/helpers.js';
import { executeAdjustmentCommand } from '../../src/adjustments/execute.js';

for (const field of ['revision', 'stock', 'cost', 'movement', 'null-movement'])
  test(`Purchase void exact ${field} precondition conflicts before eligibility/writes`, async (t) => {
    const f = await voidPurchasesFixture(t),
      purchase = await f.purchase(),
      command = await f.command(purchase.payload.purchaseId),
      before = await f.counts(f.context);
    if (field === 'revision') command.preconditions.expectedStateRevision = '0';
    else if (field === 'stock') command.preconditions.expectedState.stock++;
    else if (field === 'cost')
      command.preconditions.expectedState.unitCost = '12000000';
    else
      command.preconditions.expectedState.lastMovementId =
        field === 'movement' ? id() : null;
    await f.pool.query(
      "CREATE FUNCTION no_void() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'must not write'; END$$; CREATE TRIGGER no_void BEFORE INSERT ON inventory_movements FOR EACH ROW EXECUTE FUNCTION no_void()",
    );
    const result = await f.run(command);
    assert.equal(result.status, 'CONFLICT');
    assert.ok('error' in result);
    assert.equal(result.error.code, 'REVISION_CONFLICT');
    assert.deepEqual(result.error.details, { currentRevision: '1' });
    assert.deepEqual(await f.run(command), result);
    assert.equal((await f.counts(f.context)).revision, before.revision);
    assert.equal((await f.counts(f.context)).changes, before.changes);
  });
for (const [actual, expected] of [
  ['0', null],
  ['12000000', null],
] as const)
  test(`Purchase void rejects unknown vs known cost ${actual}/${expected}`, async (t) => {
    const f = await voidPurchasesFixture(t),
      purchase = await f.purchase(0, null, 1, actual),
      command = await f.command(purchase.payload.purchaseId);
    command.preconditions.expectedState.unitCost = expected;
    assert.equal((await f.run(command)).status, 'CONFLICT');
  });
for (const kind of ['missing', 'foreign'])
  test(`Purchase void ${kind} reference returns durable generic NOT_FOUND`, async (t) => {
    const f = await voidPurchasesFixture(t),
      other = await f.dataset(),
      purchaseId =
        kind === 'missing'
          ? id()
          : (await f.purchase(20, '10000000', 10, '12000000', other)).payload
              .purchaseId,
      command = voidPurchaseCommand(purchaseId, {
        expectedStateRevision: '0',
        expectedState: { stock: 0, unitCost: null, lastMovementId: null },
      });
    const result = await f.run(command);
    assert.equal(result.status, 'REJECTED');
    assert.ok('error' in result);
    assert.equal(result.error.code, 'NOT_FOUND');
    assert.equal(result.error.details, undefined);
    assert.deepEqual(await f.run(command), result);
  });
test('missing State is internal even for already VOIDED; no terminal receipt', async (t) => {
  const f = await voidPurchasesFixture(t),
    purchase = await f.purchase(),
    first = await f.command(purchase.payload.purchaseId);
  await f.run(first);
  const current = await f.command(purchase.payload.purchaseId),
    before = await f.counts(f.context);
  await f.pool.query('DELETE FROM inventory_states');
  await assert.rejects(() => f.run(current));
  assert.deepEqual(await f.counts(f.context), before);
});
for (const subsequent of [
  'SALE',
  'PURCHASE',
  'ADJUSTMENT',
  'REVERSAL',
  'ambiguous-time',
  'state-stock',
  'state-cost',
])
  test(`current evidence but ${subsequent} blocks Purchase void without effects`, async (t) => {
    const f = await voidPurchasesFixture(t),
      purchase = await f.purchase(),
      productId = purchase.payload.productId;
    if (subsequent === 'PURCHASE') {
      const next = await f.purchaseCommand(productId, 1, '12000000');
      next.occurredAt = 1100;
      next.payload.createdAt = 1200;
      await f.runPurchase(next);
    } else if (subsequent === 'SALE' || subsequent === 'REVERSAL') {
      const sale = saleCommand([
        {
          productId,
          quantity: 1,
          price: '15000000',
          cost: '10666667',
          estimatedCost: '10666667',
          estimatedProfit: '4333333',
        },
      ]);
      sale.occurredAt = 1100;
      sale.payload.createdAt = 1200;
      await f.execute(
        f.input(f.context, sale, (tx, inventory) =>
          executeSaleCommand(tx, inventory.id, sale),
        ),
      );
      if (subsequent === 'REVERSAL') {
        const { executeVoidSaleCommand } =
          await import('../../src/void-sales/execute.js');
        const { voidCommand } = await import('../void-sales/helpers.js');
        const row = (await f.pool.query('SELECT * FROM inventory_states'))
            .rows[0],
          reversal = voidCommand(sale.payload.saleId, [
            {
              productId,
              expectedStateRevision: row.state_revision,
              expectedState: {
                stock: Number(row.stock),
                unitCost: row.unit_cost_units,
                lastMovementId: row.last_movement_id,
              },
            },
          ]);
        await f.execute(
          f.input(f.context, reversal, (tx, inventory) =>
            executeVoidSaleCommand(tx, inventory.id, reversal, () => 2000),
          ),
        );
      }
    } else if (subsequent === 'ADJUSTMENT') {
      const evidence = (await f.command(purchase.payload.purchaseId))
          .preconditions,
        adjustment = adjustmentCommand(
          productId,
          31,
          'USE_CURRENT_COST',
          null,
          evidence,
        );
      adjustment.occurredAt = 1100;
      adjustment.payload.createdAt = 1200;
      await f.execute(
        f.input(f.context, adjustment, (tx, inventory) =>
          executeAdjustmentCommand(tx, inventory.id, adjustment),
        ),
      );
    } else if (subsequent === 'ambiguous-time')
      await f.pool.query(
        "UPDATE inventory_movements SET created_at=1000,updated_at=1000 WHERE type='INITIAL_STOCK'",
      );
    else
      await f.pool.query(
        subsequent === 'state-stock'
          ? 'UPDATE inventory_states SET stock=31'
          : 'UPDATE inventory_states SET unit_cost_units=10666668',
      );
    const command = await f.command(purchase.payload.purchaseId),
      before = await f.counts(f.context),
      states = (await f.pool.query('SELECT * FROM inventory_states')).rows,
      result = await f.run(command);
    assert.equal(result.status, 'REJECTED');
    assert.ok('error' in result);
    assert.equal(result.error.code, 'VOID_NOT_ELIGIBLE');
    assert.deepEqual(await f.run(command), result);
    const after = await f.counts(f.context);
    assert.equal(after.revision, before.revision);
    assert.equal(after.changes, before.changes);
    assert.deepEqual(
      (await f.pool.query('SELECT * FROM inventory_states')).rows,
      states,
    );
    assert.equal(
      (
        await f.pool.query('SELECT status FROM purchases WHERE id=$1', [
          purchase.payload.purchaseId,
        ])
      ).rows[0].status,
      'CONFIRMED',
    );
  });
test('later unrelated Product movement does not block Purchase void', async (t) => {
  const f = await voidPurchasesFixture(t),
    purchase = await f.purchase(),
    other = await f.product(),
    next = await f.purchaseCommand(other);
  next.occurredAt = 1100;
  next.payload.createdAt = 1200;
  await f.runPurchase(next);
  const command = await f.command(purchase.payload.purchaseId);
  assert.equal((await f.result(await f.run(command), command)).kind, 'VOIDED');
});
