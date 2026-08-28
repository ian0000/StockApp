import assert from 'node:assert/strict';
import test from 'node:test';

import { createInventoryState, Money } from '@stock-app/domain';

import { createPurchasePriceAnalysis } from '../src/index';

function analyze({
  beforeCost,
  afterCost,
  price = '15',
}: {
  readonly beforeCost: Money | null;
  readonly afterCost: Money;
  readonly price?: string;
}) {
  return createPurchasePriceAnalysis({
    beforeInventoryState: createInventoryState({
      stock: beforeCost === null ? 0 : 10,
      unitCost: beforeCost,
    }),
    afterInventoryState: createInventoryState({
      stock: 20,
      unitCost: afterCost,
    }),
    regularSalePrice: Money.fromDecimal(price),
  });
}

test('known unchanged cost does not create a price decision', () => {
  const analysis = analyze({
    beforeCost: Money.fromDecimal('10'),
    afterCost: Money.fromDecimal('10'),
  });

  assert.equal(analysis.costChanged, false);
  assert.equal(analysis.previousMargin?.scaledUnits, 33_333_333);
  assert.equal(analysis.currentMargin?.scaledUnits, 33_333_333);
  assert.equal(analysis.suggestedSalePrice, null);
});

test('known cost increase suggests a higher price preserving previous margin', () => {
  const analysis = analyze({
    beforeCost: Money.fromDecimal('10'),
    afterCost: Money.fromDecimal('12'),
  });

  assert.equal(analysis.costChanged, true);
  assert.equal(analysis.previousMargin?.scaledUnits, 33_333_333);
  assert.equal(analysis.currentMargin?.scaledUnits, 20_000_000);
  assert.equal(analysis.suggestedSalePrice?.scaledUnits, 18_000_000);
});

test('known cost decrease can suggest a lower price preserving previous margin', () => {
  const analysis = analyze({
    beforeCost: Money.fromDecimal('12'),
    afterCost: Money.fromDecimal('10'),
  });

  assert.equal(analysis.costChanged, true);
  assert.equal(analysis.previousMargin?.scaledUnits, 20_000_000);
  assert.equal(analysis.currentMargin?.scaledUnits, 33_333_333);
  assert.equal(analysis.suggestedSalePrice?.scaledUnits, 12_500_000);
});

test('unknown previous cost stays distinct and never invents a previous margin', () => {
  const analysis = analyze({
    beforeCost: null,
    afterCost: Money.fromDecimal('10'),
  });

  assert.equal(analysis.costChanged, true);
  assert.equal(analysis.previousUnitCost, null);
  assert.equal(analysis.previousMargin, null);
  assert.equal(analysis.currentMargin?.scaledUnits, 33_333_333);
  assert.equal(analysis.suggestedSalePrice, null);
});

test('known zero cost is not treated as unknown', () => {
  const analysis = analyze({
    beforeCost: Money.zero(),
    afterCost: Money.fromDecimal('10'),
  });

  assert.equal(analysis.costChanged, true);
  assert.equal(analysis.previousUnitCost?.scaledUnits, 0);
  assert.equal(analysis.previousMargin?.scaledUnits, 100_000_000);
  assert.equal(analysis.currentMargin?.scaledUnits, 33_333_333);
  assert.equal(analysis.suggestedSalePrice, null);
});

test('mathematically unavailable margins do not produce a suggestion', () => {
  const analysis = analyze({
    beforeCost: Money.fromDecimal('10'),
    afterCost: Money.fromDecimal('12'),
    price: '0',
  });

  assert.equal(analysis.previousMargin, null);
  assert.equal(analysis.currentMargin, null);
  assert.equal(analysis.suggestedSalePrice, null);
});

test('suggestion equal to the regular price is omitted', () => {
  const analysis = analyze({
    beforeCost: Money.fromDecimal('3'),
    afterCost: Money.fromDecimal('3.000001'),
    price: '1',
  });

  assert.equal(analysis.costChanged, true);
  assert.equal(analysis.previousMargin?.scaledUnits, -200_000_000);
  assert.equal(analysis.suggestedSalePrice, null);
});
