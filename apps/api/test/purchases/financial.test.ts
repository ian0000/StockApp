import assert from 'node:assert/strict';
import { test } from 'node:test';
import { purchasesFixture } from './helpers.js';
import { Money, createInventoryState } from '@stock-app/domain';
import { createPurchasePriceAnalysis } from '@stock-app/application';
import { reconstructPurchaseResult } from '../../src/purchases/results.js';

for (const [stock, beforeCost, quantity, inputCost, stockAfter, afterCost] of [
  [20, '10000000', 10, '12000000', 30, '10666667'],
  [10, '5000000', 10, '7000000', 20, '6000000'],
  [0, null, 10, '12000000', 10, '12000000'],
  [0, '10000000', 10, '14000000', 10, '14000000'],
  [-10, '10000000', 4, '12000000', -6, '12000000'],
  [-10, '10000000', 10, '12000000', 0, '12000000'],
  [-10, '10000000', 15, '12000000', 5, '12000000'],
  [-10, null, 4, '12000000', -6, '12000000'],
  [-10, null, 15, '12000000', 5, '12000000'],
  [0, null, 2, '0', 2, '0'],
  [20, '10000000', 10, '0', 30, '6666667'],
  [20, '10000000', 10, '10000000', 30, '10000000'],
] as const)
  test(`Purchase exact ${stock}@${beforeCost} + ${quantity}@${inputCost} -> ${stockAfter}@${afterCost}`, async (t) => {
    const f = await purchasesFixture(t),
      productId = await f.product(stock, beforeCost),
      command = await f.command(productId, quantity, inputCost),
      receipt = await f.run(command);
    assert.equal(receipt.status, 'ACCEPTED');
    assert.ok('changeSet' in receipt);
    const up = receipt.changeSet.upserts,
      purchase = up.purchases[0],
      movement = up.inventoryMovements[0],
      state = up.inventoryStates[0];
    assert.equal(purchase.stockBefore, stock);
    assert.equal(purchase.stockAfter, stockAfter);
    assert.equal(purchase.averageCostBefore, beforeCost);
    assert.equal(purchase.averageCostAfter, afterCost);
    assert.equal(purchase.unitCost, inputCost);
    assert.equal(
      purchase.totalAmount,
      String(BigInt(inputCost) * BigInt(quantity)),
    );
    assert.equal(purchase.status, 'CONFIRMED');
    assert.equal(movement.type, 'PURCHASE');
    assert.equal(movement.quantityDelta, quantity);
    assert.equal(movement.unitCostSnapshot, inputCost);
    assert.equal(movement.sourceType, 'PURCHASE');
    assert.equal(movement.sourceId, purchase.id);
    assert.equal(state.stock, stockAfter);
    assert.equal(state.unitCost, afterCost);
    assert.equal(state.stateRevision, '1');
    assert.equal(state.lastMovementId, command.payload.movementId);
    assert.equal(up.products.length, 1);
    assert.equal(up.purchases.length, 1);
    assert.equal(up.inventoryStates.length, 1);
    assert.equal(up.inventoryMovements.length, 1);
    assert.equal(
      up.sales.length +
        up.saleItems.length +
        up.stockAdjustments.length +
        receipt.changeSet.tombstones.length,
      0,
    );
    const product = (await f.pool.query('SELECT * FROM products')).rows[0];
    assert.equal(product.regular_sale_price_units, '15000000');
    assert.equal(product.metadata_revision, '0');
  });

for (const [label, before, after, price, suggestion] of [
  ['increase', '10000000', '12000000', '15000000', '18000000'],
  ['unchanged', '10000000', '10000000', '15000000', null],
  ['decrease', '12000000', '10000000', '15000000', null],
  ['unknown', null, '10000000', '15000000', null],
  ['known zero before', '0', '10000000', '15000000', null],
  ['known zero after', '10000000', '0', '15000000', null],
  ['price zero', '10000000', '12000000', '0', null],
  ['negative previous margin', '12000000', '14000000', '10000000', null],
  ['margin overflow unavailable', null, '9007199254740991', '1', null],
  [
    'suggestion overflow unavailable',
    '1',
    '1000000000000000',
    '100000000',
    null,
  ],
] as const)
  test(`Purchase commits with Application price analysis: ${label}`, async (t) => {
    const f = await purchasesFixture(t),
      productId = await f.product(0, before, price),
      command = await f.command(productId, 1, after),
      result = reconstructPurchaseResult(await f.run(command), command);
    const units = (value: string) => Money.fromScaledUnits(Number(value));
    const reference = createPurchasePriceAnalysis({
      beforeInventoryState: createInventoryState({
        stock: 0,
        unitCost: before === null ? null : units(before),
      }),
      afterInventoryState: createInventoryState({
        stock: 1,
        unitCost: units(after),
      }),
      regularSalePrice: units(price),
    });
    assert.deepEqual(result.priceAnalysis, {
      previousUnitCost:
        reference.previousUnitCost?.scaledUnits.toString() ?? null,
      currentUnitCost: reference.currentUnitCost.scaledUnits.toString(),
      regularSalePrice: reference.regularSalePrice.scaledUnits.toString(),
      previousMargin: reference.previousMargin?.scaledUnits.toString() ?? null,
      currentMargin: reference.currentMargin?.scaledUnits.toString() ?? null,
      suggestedSalePrice:
        reference.suggestedSalePrice?.scaledUnits.toString() ?? null,
      costChanged: reference.costChanged,
    });
    assert.equal(result.priceAnalysis.suggestedSalePrice, suggestion);
    assert.equal(result.priceAnalysis.costChanged, before !== after);
    if (label === 'margin overflow unavailable' || label === 'price zero')
      assert.equal(result.priceAnalysis.currentMargin, null);
    assert.equal(result.product.regularSalePrice, price);
    assert.equal(
      (await f.pool.query('SELECT regular_sale_price_units FROM products'))
        .rows[0].regular_sale_price_units,
      price,
    );
  });
