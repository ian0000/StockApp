import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createSchemaValidator,
  contractSchemas,
  type SaleDetailDto,
  type PurchaseDetailDto,
} from '@stock-app/contracts';
import { readFixture } from './helpers.js';
import {
  readSaleDetail,
  readPurchaseDetail,
} from '../../src/read-models/details.js';
import { id } from '../postgres/helpers.js';

for (const kind of ['sale', 'purchase'] as const)
  for (const scenario of [
    'eligible',
    'subsequent',
    'mismatch',
    'voided',
  ] as const)
    test(`${kind} detail semantic matrix ${scenario} agrees with current mutation policy`, async (t) => {
      const f = await readFixture(t),
        command = kind === 'sale' ? await f.sold() : await f.purchase(),
        operationId =
          command.commandKind === 'SALE_REGISTER'
            ? command.payload.saleId
            : command.payload.purchaseId,
        productId =
          command.commandKind === 'SALE_REGISTER'
            ? command.payload.items[0].productId
            : command.payload.productId;
      const before =
        kind === 'sale'
          ? await readSaleDetail(f.db, f.context.inventory.id, operationId)
          : await readPurchaseDetail(f.db, f.context.inventory.id, operationId);
      assert.ok(before);
      assert.deepEqual(before.voidEligibility, {
        eligible: true,
        reason: null,
      });
      if (scenario === 'subsequent')
        await f.sold(
          kind === 'sale' ? '10000000' : '10666667',
          f.context,
          2000,
          1,
          productId,
        );
      if (scenario === 'mismatch')
        await f.pool.query(
          'UPDATE inventory_states SET stock=99 WHERE product_id=$1',
          [productId],
        );
      if (scenario === 'voided') {
        if (command.commandKind === 'SALE_REGISTER') await f.voidSale(command);
        else {
          const next = await f.command(operationId);
          await f.run(next);
        }
      }
      const counts = await f.counts(f.context),
        detail = await f.read<SaleDetailDto | PurchaseDetailDto | null>((db) =>
          kind === 'sale'
            ? readSaleDetail(db, f.context.inventory.id, operationId)
            : readPurchaseDetail(db, f.context.inventory.id, operationId),
        );
      assert.ok(detail);
      createSchemaValidator(
        kind === 'sale'
          ? contractSchemas.SaleDetail
          : contractSchemas.PurchaseDetail,
      )(detail);
      assert.deepEqual(
        detail.voidEligibility,
        scenario === 'eligible'
          ? { eligible: true, reason: null }
          : scenario === 'voided'
            ? { eligible: false, reason: null }
            : {
                eligible: false,
                reason:
                  scenario === 'subsequent'
                    ? 'SUBSEQUENT_OR_AMBIGUOUS_MOVEMENT'
                    : 'CURRENT_STATE_MISMATCH',
              },
      );
      assert.deepEqual(await f.counts(f.context), counts);
    });
test('SaleDetail enriches active/renamed/variant-changed/archived/VOIDED items with current metadata only', async (t) => {
  const f = await readFixture(t),
    sale = await f.sold(),
    productId = sale.payload.items[0].productId;
  await f.pool.query(
    "UPDATE products SET name='Name at sale',variant='Old variant' WHERE id=$1",
    [productId],
  );
  const original = await readSaleDetail(
    f.db,
    f.context.inventory.id,
    sale.payload.saleId,
  );
  assert.ok(original);
  const financial = (await f.pool.query('SELECT * FROM sale_items')).rows;
  assert.equal(original.items[0].productName, 'Name at sale');
  assert.equal(original.items[0].productVariant, 'Old variant');
  for (const archive of [false, true]) {
    await f.pool.query(
      "UPDATE products SET name='Current renamed name',variant='Current variant',is_archived=$1 WHERE id=$2",
      [archive, productId],
    );
    const detail = await readSaleDetail(
      f.db,
      f.context.inventory.id,
      sale.payload.saleId,
    );
    assert.ok(detail);
    assert.equal(detail.items[0].productName, 'Current renamed name');
    assert.equal(detail.items[0].productVariant, 'Current variant');
    assert.deepEqual(
      { ...detail.items[0], productName: null, productVariant: null },
      { ...original.items[0], productName: null, productVariant: null },
    );
    assert.deepEqual(detail.sale, original.sale);
    assert.deepEqual(
      (await f.pool.query('SELECT * FROM sale_items')).rows,
      financial,
    );
  }
  await f.voidSale(sale);
  const voided = await readSaleDetail(
    f.db,
    f.context.inventory.id,
    sale.payload.saleId,
  );
  assert.ok(voided);
  assert.equal(voided.sale.status, 'VOIDED');
  assert.equal(voided.items[0].productName, 'Current renamed name');
  assert.deepEqual(voided.voidEligibility, { eligible: false, reason: null });
});
test('unknown financial snapshots remain null in enriched Sale detail', async (t) => {
  const f = await readFixture(t),
    sale = await f.sold(null),
    detail = await readSaleDetail(
      f.db,
      f.context.inventory.id,
      sale.payload.saleId,
    );
  assert.ok(detail);
  assert.equal(detail.items[0].costStatus, 'UNKNOWN');
  assert.equal(detail.items[0].unitCostSnapshot, null);
  assert.equal(detail.items[0].estimatedCost, null);
  assert.equal(detail.items[0].estimatedProfit, null);
  assert.equal(detail.sale.estimatedProfit, null);
});
test('optional unresolved historical Product metadata is null and known foreign IDs cannot leak names', async (t) => {
  const f = await readFixture(t),
    sale = await f.sold(),
    other = await f.dataset(),
    foreign = await f.product(20, '10000000', '15000000', other);
  await f.pool.query(
    "UPDATE products SET name='FOREIGN_READ_METADATA_CANARY_Q7X9K2',variant='FOREIGN_VARIANT_CANARY_Q7X9K2' WHERE id=$1",
    [foreign],
  );
  await f.voidSale(sale);
  for (const reference of [id(), foreign]) {
    const client = await f.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL session_replication_role=replica');
      await client.query(
        'UPDATE sale_items SET product_id=$1 WHERE sale_id=$2',
        [reference, sale.payload.saleId],
      );
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    const detail = await readSaleDetail(
      f.db,
      f.context.inventory.id,
      sale.payload.saleId,
    );
    assert.ok(detail);
    assert.equal(detail.items[0].productName, null);
    assert.equal(detail.items[0].productVariant, null);
    assert.doesNotMatch(
      JSON.stringify(detail),
      /FOREIGN_READ_METADATA|FOREIGN_VARIANT/,
    );
    assert.equal(detail.items[0].unitCostSnapshot, '10000000');
  }
});
test('own entity readers conceal missing and foreign Sale/Purchase identifiers', async (t) => {
  const f = await readFixture(t),
    other = await f.dataset(),
    sale = await f.sold('10000000', other),
    purchase = await f.purchase(20, '10000000', 10, '12000000', other);
  for (const value of [id(), sale.payload.saleId])
    assert.equal(
      await readSaleDetail(f.db, f.context.inventory.id, value),
      null,
    );
  for (const value of [id(), purchase.payload.purchaseId])
    assert.equal(
      await readPurchaseDetail(f.db, f.context.inventory.id, value),
      null,
    );
});
for (const corruption of [
  'missing-original',
  'duplicate-original',
  'existing-reversal',
  'missing-state',
  'missing-items',
])
  test(`confirmed Sale detail fails closed for ${corruption}`, async (t) => {
    const f = await readFixture(t),
      sale = await f.sold(),
      movement = sale.payload.items[0].movementId;
    if (corruption === 'missing-state')
      await f.pool.query('DELETE FROM inventory_states');
    else if (corruption === 'missing-items')
      await f.pool.query('DELETE FROM sale_items');
    else if (corruption === 'missing-original') {
      await f.pool.query('UPDATE inventory_states SET last_movement_id=NULL');
      await f.pool.query("DELETE FROM inventory_movements WHERE type='SALE'");
    } else if (corruption === 'duplicate-original')
      await f.pool.query(
        'INSERT INTO inventory_movements(id,inventory_id,product_id,type,quantity_delta,unit_cost_snapshot_units,stock_before,stock_after,source_type,source_id,metadata,reversal_of_movement_id,effective_at,created_at,updated_at) SELECT $1::uuid,inventory_id,product_id,type,quantity_delta,unit_cost_snapshot_units,stock_before,stock_after,source_type,source_id,metadata,reversal_of_movement_id,effective_at,created_at,updated_at FROM inventory_movements WHERE id=$2',
        [id(), movement],
      );
    else
      await f.pool.query(
        "INSERT INTO inventory_movements(id,inventory_id,product_id,type,quantity_delta,unit_cost_snapshot_units,stock_before,stock_after,source_type,source_id,reversal_of_movement_id,effective_at,created_at,updated_at)VALUES($1,$2,$3,'REVERSAL',2,10000000,18,20,'INVENTORY_MOVEMENT',$4,$4,1500,1600,1600)",
        [
          id(),
          f.context.inventory.id,
          sale.payload.items[0].productId,
          movement,
        ],
      );
    const before = await f.counts(f.context);
    await assert.rejects(() =>
      readSaleDetail(f.db, f.context.inventory.id, sale.payload.saleId),
    );
    assert.deepEqual(await f.counts(f.context), before);
  });
