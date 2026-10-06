import assert from 'node:assert/strict';
import { test } from 'node:test';
import { voidSalesFixture, voidCommand } from './helpers.js';
import { id } from '../postgres/helpers.js';
import { saleCommand } from '../sales/helpers.js';
import { purchaseCommand } from '../purchases/helpers.js';
import { adjustmentCommand } from '../adjustments/helpers.js';
import { executePurchaseCommand } from '../../src/purchases/execute.js';
import { executeAdjustmentCommand } from '../../src/adjustments/execute.js';

for (const mismatch of [
  'revision',
  'stock',
  'cost',
  'movement',
  'null-movement',
])
  test(`Void exact ${mismatch} conflict precedes eligibility and commercial writes`, async (t) => {
    const f = await voidSalesFixture(t),
      sale = await f.sale(2),
      command = await f.command(sale.payload.saleId),
      evidence = command.preconditions.states[1];
    if (mismatch === 'revision') evidence.expectedStateRevision = '0';
    else if (mismatch === 'stock') evidence.expectedState.stock = 7;
    else if (mismatch === 'cost') evidence.expectedState.unitCost = '5000001';
    else
      evidence.expectedState.lastMovementId =
        mismatch === 'movement' ? id() : null;
    await f.pool.query(
      "CREATE FUNCTION no_void() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'must not write'; END$$; CREATE TRIGGER no_void BEFORE INSERT ON inventory_movements FOR EACH ROW EXECUTE FUNCTION no_void()",
    );
    const before = await f.counts(f.context),
      states = (await f.pool.query('SELECT * FROM inventory_states')).rows,
      result = await f.run(command);
    assert.equal(result.status, 'CONFLICT');
    assert.ok('error' in result);
    assert.equal(result.error.code, 'REVISION_CONFLICT');
    assert.deepEqual(result.error.details, { currentRevision: '1' });
    assert.deepEqual(await f.run(command), result);
    assert.equal((await f.counts(f.context)).revision, before.revision);
    assert.equal((await f.counts(f.context)).changes, before.changes);
    assert.deepEqual(
      (await f.pool.query('SELECT * FROM inventory_states')).rows,
      states,
    );
    assert.equal(
      (
        await f.pool.query(
          "SELECT count(*) FROM sales WHERE status='CONFIRMED'",
        )
      ).rows[0].count,
      '1',
    );
  });
for (const [actual, expected] of [
  [null, '0'],
  ['0', null],
] as const)
  test(`Void distinguishes unknown and zero ${actual}/${expected}`, async (t) => {
    const f = await voidSalesFixture(t),
      sale = await f.sale(1, 0, actual),
      command = await f.command(sale.payload.saleId);
    command.preconditions.states[0].expectedState.unitCost = expected;
    assert.equal((await f.run(command)).status, 'CONFLICT');
  });
for (const scenario of ['missing', 'foreign'])
  test(`Void ${scenario} Sale returns terminal NOT_FOUND without existence details`, async (t) => {
    const f = await voidSalesFixture(t),
      other = await f.dataset(),
      saleId =
        scenario === 'missing'
          ? id()
          : (await f.sale(1, 10, '5000000', other)).payload.saleId;
    const command = voidCommand(saleId, [
        {
          productId: id(),
          expectedStateRevision: '0',
          expectedState: { stock: 0, unitCost: null, lastMovementId: null },
        },
      ]),
      result = await f.run(command);
    assert.equal(result.status, 'REJECTED');
    assert.ok('error' in result);
    assert.equal(result.error.code, 'NOT_FOUND');
    assert.equal(result.error.details, undefined);
    assert.deepEqual(await f.run(command), result);
  });
for (const coverage of ['missing', 'extra', 'foreign-product'])
  test(`Void reversal coverage ${coverage} is terminal DOMAIN_RULE`, async (t) => {
    const f = await voidSalesFixture(t),
      sale = await f.sale(2),
      command = await f.command(sale.payload.saleId);
    if (coverage === 'missing') {
      command.payload.reversalMovements.pop();
      command.preconditions.states.pop();
    } else if (coverage === 'extra') {
      const productId = await f.product();
      command.payload.reversalMovements.push({ productId, movementId: id() });
      command.preconditions.states.push({
        productId,
        expectedStateRevision: '0',
        expectedState: { stock: 10, unitCost: '5000000', lastMovementId: null },
      });
    } else {
      const productId = id();
      command.payload.reversalMovements[0].productId = productId;
      command.preconditions.states[0].productId = productId;
    }
    const before = await f.counts(f.context),
      result = await f.run(command);
    assert.equal(result.status, 'REJECTED');
    assert.ok('error' in result);
    assert.equal(result.error.code, 'DOMAIN_RULE');
    assert.equal((await f.counts(f.context)).revision, before.revision);
    assert.equal(
      (
        await f.pool.query(
          "SELECT count(*) FROM inventory_movements WHERE type='REVERSAL'",
        )
      ).rows[0].count,
      '0',
    );
  });
test('missing state and impossible positive-stock unknown cost are internal, not user ineligibility', async (t) => {
  const f = await voidSalesFixture(t),
    sale = await f.sale(),
    command = await f.command(sale.payload.saleId),
    product = sale.payload.items[0].productId,
    before = await f.counts(f.context);
  await f.pool.query('DELETE FROM inventory_states WHERE product_id=$1', [
    product,
  ]);
  await assert.rejects(() => f.run(command));
  assert.deepEqual(await f.counts(f.context), before);
  await f.pool.query(
    'ALTER TABLE inventory_states DROP CONSTRAINT inventory_states_positive_stock_cost_required',
  );
  await f.pool.query(
    'INSERT INTO inventory_states(inventory_id,product_id,stock)VALUES($1,$2,8)',
    [f.context.inventory.id, product],
  );
  await assert.rejects(() => f.run(command));
  assert.deepEqual(await f.counts(f.context), before);
});
for (const subsequent of [
  'SALE',
  'PURCHASE',
  'ADJUSTMENT',
  'ambiguous-time',
  'state-stock',
  'state-cost',
])
  test(`one affected line ${subsequent} blocks whole Void with current evidence`, async (t) => {
    const f = await voidSalesFixture(t),
      sale = await f.sale(3),
      product = sale.payload.items[1].productId;
    if (subsequent === 'SALE') {
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
      next.occurredAt = 1100;
      next.payload.createdAt = 1200;
      await f.runSale(next);
    } else if (subsequent === 'PURCHASE' || subsequent === 'ADJUSTMENT') {
      const evidence = (
        await f.command(sale.payload.saleId)
      ).preconditions.states.find((s) => s.productId === product);
      assert.ok(evidence);
      const preconditions = {
        expectedStateRevision: evidence.expectedStateRevision,
        expectedState: evidence.expectedState,
      };
      const next =
        subsequent === 'PURCHASE'
          ? purchaseCommand(product, 1, '5000000', preconditions)
          : adjustmentCommand(
              product,
              9,
              'USE_CURRENT_COST',
              null,
              preconditions,
            );
      next.occurredAt = 1100;
      next.payload.createdAt = 1200;
      await f.execute(
        f.input(f.context, next, (tx, inventory) =>
          next.commandKind === 'PURCHASE_REGISTER'
            ? executePurchaseCommand(tx, inventory.id, next)
            : executeAdjustmentCommand(tx, inventory.id, next),
        ),
      );
    } else if (subsequent === 'ambiguous-time')
      await f.pool.query(
        "UPDATE inventory_movements SET created_at=1000,updated_at=1000 WHERE type='INITIAL_STOCK' AND product_id=$1",
        [product],
      );
    else
      await f.pool.query(
        subsequent === 'state-stock'
          ? 'UPDATE inventory_states SET stock=7 WHERE product_id=$1'
          : 'UPDATE inventory_states SET unit_cost_units=5000001 WHERE product_id=$1',
        [product],
      );
    const command = await f.command(sale.payload.saleId),
      before = await f.counts(f.context),
      states = (await f.pool.query('SELECT * FROM inventory_states')).rows,
      result = await f.run(command);
    assert.equal(result.status, 'REJECTED');
    assert.ok('error' in result);
    assert.equal(result.error.code, 'VOID_NOT_ELIGIBLE');
    assert.deepEqual(await f.run(command), result);
    assert.equal((await f.counts(f.context)).revision, before.revision);
    assert.deepEqual(
      (await f.pool.query('SELECT * FROM inventory_states')).rows,
      states,
    );
    assert.equal(
      (
        await f.pool.query(
          "SELECT count(*) FROM inventory_movements WHERE type='REVERSAL'",
        )
      ).rows[0].count,
      '0',
    );
    assert.equal(
      (
        await f.pool.query('SELECT status FROM sales WHERE id=$1', [
          sale.payload.saleId,
        ])
      ).rows[0].status,
      'CONFIRMED',
    );
  });
test('later movement of an unrelated product does not block historical Void', async (t) => {
  const f = await voidSalesFixture(t),
    sale = await f.sale(),
    other = await f.product(),
    next = saleCommand([
      {
        productId: other,
        quantity: 1,
        price: '15000000',
        cost: '5000000',
        estimatedCost: '5000000',
        estimatedProfit: '10000000',
      },
    ]);
  next.occurredAt = 1100;
  next.payload.createdAt = 1200;
  await f.runSale(next);
  const command = await f.command(sale.payload.saleId);
  assert.equal((await f.run(command)).status, 'ACCEPTED');
});
