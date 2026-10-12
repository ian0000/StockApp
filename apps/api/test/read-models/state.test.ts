import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contractSchemas, createSchemaValidator } from '@stock-app/contracts';
import { readProductState } from '../../src/read-models/state.js';
import { readProduct } from '../../src/read-models/products.js';
import { readFixture } from './helpers.js';
import { id } from '../postgres/helpers.js';
import { voidPurchaseCommand } from '../void-purchases/helpers.js';
import { voidCommand } from '../void-sales/helpers.js';
import { saleCommand } from '../sales/helpers.js';
import { executeSaleCommand } from '../../src/sales/execute.js';
import { executeVoidSaleCommand } from '../../src/void-sales/execute.js';

for (const archived of [false, true])
  for (const cost of [null, '0', '1234567'])
    test(`State reader own archived=${archived} cost=${cost} preserves exact evidence without writes`, async (t) => {
      const f = await readFixture(t),
        productId = await f.product(cost === null ? 0 : 20, cost);
      await f.pool.query('UPDATE products SET is_archived=$1 WHERE id=$2', [
        archived,
        productId,
      ]);
      await f.pool.query(
        'UPDATE inventory_states SET state_revision=9007199254740993 WHERE product_id=$1',
        [productId],
      );
      const row = (
        await f.pool.query(
          'SELECT * FROM inventory_states WHERE product_id=$1',
          [productId],
        )
      ).rows[0];
      const before = await f.counts(f.context);
      const state = await f.read((db) =>
        readProductState(db, f.context.inventory.id, productId.toUpperCase()),
      );
      assert.ok(state);
      createSchemaValidator(contractSchemas.InventoryState)(state);
      assert.deepEqual(state, {
        inventoryId: f.context.inventory.id,
        productId,
        stock: cost === null ? 0 : 20,
        unitCost: cost,
        stateRevision: '9007199254740993',
        lastMovementId: row.last_movement_id,
      });
      assert.deepEqual(await f.counts(f.context), before);
      assert.deepEqual(
        (
          await f.pool.query(
            'SELECT * FROM inventory_states WHERE product_id=$1',
            [productId],
          )
        ).rows[0],
        row,
      );
      assert.equal(
        await f.read((db) =>
          readProductState(db, f.context.inventory.id, id()),
        ),
        null,
      );
      const foreign = await f.dataset();
      assert.equal(
        await f.read((db) =>
          readProductState(db, foreign.inventory.id, productId),
        ),
        null,
      );
      assert.equal(
        (await f.read((db) =>
          readProduct(db, f.context.inventory.id, { id: productId }),
        )) === null,
        archived,
      );
    });
test('mandatory State missing is integrity failure even for an archived Product', async (t) => {
  const f = await readFixture(t),
    productId = await f.product();
  await f.pool.query('UPDATE products SET is_archived=true WHERE id=$1', [
    productId,
  ]);
  await f.pool.query('DELETE FROM inventory_states WHERE product_id=$1', [
    productId,
  ]);
  await assert.rejects(
    f.read((db) => readProductState(db, f.context.inventory.id, productId)),
  );
});
for (const beforeCost of [null, '0', '10000000'])
  test(`archived Purchase void uses current State reader and restores ${beforeCost} snapshot`, async (t) => {
    const f = await readFixture(t),
      purchase = await f.purchase(beforeCost === null ? 0 : 20, beforeCost);
    await f.pool.query('UPDATE products SET is_archived=true WHERE id=$1', [
      purchase.payload.productId,
    ]);
    const state = await f.read((db) =>
      readProductState(db, f.context.inventory.id, purchase.payload.productId),
    );
    assert.ok(state);
    const command = voidPurchaseCommand(purchase.payload.purchaseId, {
      expectedStateRevision: state.stateRevision,
      expectedState: {
        stock: state.stock,
        unitCost: state.unitCost,
        lastMovementId: state.lastMovementId,
      },
    });
    const result = await f.result(await f.run(command), command);
    assert.equal(result.kind, 'VOIDED');
    assert.equal(result.states[0].unitCost, beforeCost);
    assert.equal(
      (
        await f.pool.query('SELECT is_archived FROM products WHERE id=$1', [
          state.productId,
        ])
      ).rows[0].is_archived,
      true,
    );
  });
test('mixed archived/active multi-product Sale uses State reads, and stale evidence blocks the whole void', async (t) => {
  const f = await readFixture(t),
    a = await f.product(20, '10000000'),
    b = await f.product(20, '10000000');
  const sale = saleCommand(
    [a, b].map((productId) => ({
      productId,
      quantity: 2,
      price: '15000000',
      cost: '10000000',
      estimatedCost: '20000000',
      estimatedProfit: '10000000',
    })),
  );
  sale.occurredAt = 1000;
  sale.payload.createdAt = 1100;
  await f.execute(
    f.input(f.context, sale, (tx, inv) => executeSaleCommand(tx, inv.id, sale)),
  );
  await f.pool.query('UPDATE products SET is_archived=true WHERE id=$1', [a]);
  const evidence = await Promise.all(
    [a, b].map(async (productId) => {
      const state = await f.read((db) =>
        readProductState(db, f.context.inventory.id, productId),
      );
      assert.ok(state);
      return {
        productId,
        expectedStateRevision: state.stateRevision,
        expectedState: {
          stock: state.stock,
          unitCost: state.unitCost,
          lastMovementId: state.lastMovementId,
        },
      };
    }),
  );
  await f.sold('10000000', f.context, 2000, 1, b);
  const command = voidCommand(sale.payload.saleId, evidence);
  const result = await f.execute(
    f.input(f.context, command, (tx, inv) =>
      executeVoidSaleCommand(tx, inv.id, command),
    ),
  );
  assert.equal(result.status, 'CONFLICT');
  assert.equal(result.error.code, 'REVISION_CONFLICT');
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
  assert.equal(
    (await f.read((db) => readProductState(db, f.context.inventory.id, a)))
      ?.stock,
    18,
  );
  assert.equal(
    (await f.read((db) => readProductState(db, f.context.inventory.id, b)))
      ?.stock,
    17,
  );
});
test('archived Sale can be voided with fresh exact State from the reader', async (t) => {
  const f = await readFixture(t),
    sale = await f.sold(),
    productId = sale.payload.items[0].productId;
  await f.pool.query('UPDATE products SET is_archived=true WHERE id=$1', [
    productId,
  ]);
  const state = await f.read((db) =>
    readProductState(db, f.context.inventory.id, productId),
  );
  assert.ok(state);
  const command = voidCommand(sale.payload.saleId, [
    {
      productId,
      expectedStateRevision: state.stateRevision,
      expectedState: {
        stock: state.stock,
        unitCost: state.unitCost,
        lastMovementId: state.lastMovementId,
      },
    },
  ]);
  command.occurredAt = 1500;
  command.payload.createdAt = 1600;
  const result = await f.execute(
    f.input(f.context, command, (tx, inv) =>
      executeVoidSaleCommand(tx, inv.id, command, () => 2000),
    ),
  );
  assert.equal(result.status, 'ACCEPTED');
  if (result.status === 'ACCEPTED')
    assert.equal(result.changeSet.upserts.sales[0]?.status, 'VOIDED');
});
for (const kind of ['sale', 'purchase'])
  test(`${kind} historical void accepts exact nullable State pointer without deriving original ledger identity`, async (t) => {
    const f = await readFixture(t);
    const original = kind === 'sale' ? await f.sold() : await f.purchase();
    const productId =
      original.commandKind === 'SALE_REGISTER'
        ? original.payload.items[0].productId
        : original.payload.productId;
    await f.pool.query(
      'UPDATE inventory_states SET last_movement_id=NULL WHERE product_id=$1',
      [productId],
    );
    const state = await f.read((db) =>
      readProductState(db, f.context.inventory.id, productId),
    );
    assert.ok(state);
    assert.equal(state.lastMovementId, null);
    const evidence = {
      expectedStateRevision: state.stateRevision,
      expectedState: {
        stock: state.stock,
        unitCost: state.unitCost,
        lastMovementId: state.lastMovementId,
      },
    };
    const command =
      original.commandKind === 'SALE_REGISTER'
        ? voidCommand(original.payload.saleId, [{ productId, ...evidence }])
        : voidPurchaseCommand(original.payload.purchaseId, evidence);
    command.occurredAt = 1500;
    command.payload.createdAt = 1600;
    const receipt =
      command.commandKind === 'SALE_VOID'
        ? await f.execute(
            f.input(f.context, command, (tx, inv) =>
              executeVoidSaleCommand(tx, inv.id, command, () => 2000),
            ),
          )
        : await f.run(command);
    assert.equal(receipt.status, 'ACCEPTED');
    if (receipt.status === 'ACCEPTED') {
      const movement = receipt.changeSet.upserts.inventoryMovements[0]!;
      assert.ok(movement.reversalOfMovementId);
      assert.equal(
        receipt.changeSet.upserts.inventoryStates[0]!.lastMovementId,
        movement.id,
      );
    }
  });
