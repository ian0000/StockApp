import assert from 'node:assert/strict';
import test from 'node:test';
import { createInventoryState, Money, Percentage } from '@stock-app/domain';
import {
  canEditPurchaseMargin,
  createPurchasePriceAnalysis,
  getInitialPurchaseMargin,
  recommendPurchasePrice,
} from '../src/index';

function analysis(before: string | null, after: string, price: string) {
  return createPurchasePriceAnalysis({
    beforeInventoryState: createInventoryState({
      stock: 0,
      unitCost: before === null ? null : Money.fromDecimal(before),
    }),
    afterInventoryState: createInventoryState({
      stock: 1,
      unitCost: Money.fromDecimal(after),
    }),
    regularSalePrice: Money.fromDecimal(price),
  });
}

test('previous valid margin remains the exact first reference', () => {
  const value = analysis('7', '8', '10');
  assert.equal(canEditPurchaseMargin(value.currentUnitCost), true);
  assert.strictEqual(getInitialPurchaseMargin(value), value.previousMargin);
});

test('physical negative previous margin falls back to current and accepts a chosen 30 percent', () => {
  const value = analysis('8.63', '7.65', '7.84');
  assert.ok(
    value.previousMargin !== null && value.previousMargin.scaledUnits < 0,
  );
  assert.strictEqual(getInitialPurchaseMargin(value), value.currentMargin);
  assert.equal(canEditPurchaseMargin(value.currentUnitCost), true);
  const recommendation = recommendPurchasePrice(
    value,
    Percentage.fromDecimal('30'),
  );
  assert.equal(recommendation.status, 'PRICE_INCREASE_SUGGESTED');
  assert.equal(recommendation.calculatedPrice.scaledUnits, 10_928_571);
});

for (const price of ['0', '5']) {
  test(`both margins invalid with price ${price} leaves reference empty, not editor unavailable`, () => {
    const value = analysis('8', '7', price);
    assert.equal(getInitialPurchaseMargin(value), null);
    assert.equal(canEditPurchaseMargin(value.currentUnitCost), true);
    assert.equal(recommendPurchasePrice(value, null).status, 'UNAVAILABLE');
    assert.equal(
      recommendPurchasePrice(value, Percentage.fromDecimal('30')).status,
      'PRICE_INCREASE_SUGGESTED',
    );
  });
}

for (const before of [null, '0']) {
  test(`previous cost ${before} uses valid current margin without changing cost meaning`, () => {
    const value = analysis(before, '7', '10');
    assert.strictEqual(getInitialPurchaseMargin(value), value.currentMargin);
    assert.equal(
      value.previousUnitCost?.scaledUnits ?? null,
      before === null ? null : 0,
    );
  });
}

test('unchanged known positive cost still allows the desired margin editor', () => {
  const value = analysis('7', '7', '10');
  assert.equal(value.costChanged, false);
  assert.equal(canEditPurchaseMargin(value.currentUnitCost), true);
  assert.strictEqual(getInitialPurchaseMargin(value), value.previousMargin);
  assert.equal(
    recommendPurchasePrice(value, Percentage.fromDecimal('40')).status,
    'PRICE_INCREASE_SUGGESTED',
  );
});

test('unknown current cost remains unavailable under the existing known-cost Purchase contract', () => {
  assert.equal(canEditPurchaseMargin(null), false);
  assert.throws(
    () =>
      createPurchasePriceAnalysis({
        beforeInventoryState: createInventoryState({
          stock: 0,
          unitCost: null,
        }),
        afterInventoryState: createInventoryState({ stock: 0, unitCost: null }),
        regularSalePrice: Money.fromDecimal('10'),
      }),
    /resulting cost unexpectedly missing/,
  );
});

test('known zero stays known but the unchanged Domain rule yields no suggestion', () => {
  const value = analysis('7', '0', '10');
  assert.equal(value.currentUnitCost.scaledUnits, 0);
  assert.equal(canEditPurchaseMargin(value.currentUnitCost), false);
  assert.equal(getInitialPurchaseMargin(value), null);
  assert.equal(
    recommendPurchasePrice(value, Percentage.fromDecimal('30')).status,
    'UNAVAILABLE',
  );
});

test('an overflowing initial reference does not prevent choosing a calculable margin', () => {
  const value = analysis('1', '1000', '100');
  const extreme = {
    ...value,
    previousMargin: Percentage.fromDecimal('99.999999'),
  };
  assert.strictEqual(getInitialPurchaseMargin(extreme), extreme.previousMargin);
  assert.equal(canEditPurchaseMargin(extreme.currentUnitCost), true);
  assert.equal(
    recommendPurchasePrice(extreme, extreme.previousMargin).status,
    'UNAVAILABLE',
  );
  assert.equal(
    recommendPurchasePrice(extreme, Percentage.zero()).status,
    'PRICE_INCREASE_SUGGESTED',
  );
});
