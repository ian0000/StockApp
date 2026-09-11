import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInventoryState,
  Money,
  Percentage,
  suggestSalePriceForMargin,
} from '@stock-app/domain';

import {
  createPurchasePriceAnalysis,
  getInitialPurchaseMargin,
  recommendPurchasePrice,
} from '../src/index';

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

test('known cost decrease never recommends lowering the regular price', () => {
  const analysis = analyze({
    beforeCost: Money.fromDecimal('12'),
    afterCost: Money.fromDecimal('10'),
  });

  assert.equal(analysis.costChanged, true);
  assert.equal(analysis.previousMargin?.scaledUnits, 20_000_000);
  assert.equal(analysis.currentMargin?.scaledUnits, 33_333_333);
  assert.equal(analysis.suggestedSalePrice, null);
  const recommendation = recommendPurchasePrice(
    analysis,
    analysis.previousMargin,
  );
  assert.equal(recommendation.status, 'CURRENT_PRICE_ALREADY_SUFFICIENT');
  assert.equal(recommendation.calculatedPrice.scaledUnits, 12_500_000);
  assert.equal(recommendation.actionableSuggestedPrice.scaledUnits, 15_000_000);
});

test('initial desired margin is the exact previous margin, not a rounded display value', () => {
  const analysis = analyze({
    beforeCost: Money.fromDecimal('10'),
    afterCost: Money.fromDecimal('12'),
  });
  assert.strictEqual(
    getInitialPurchaseMargin(analysis),
    analysis.previousMargin,
  );
});

for (const [margin, status, units] of [
  [20_000_000, 'CURRENT_PRICE_ALREADY_SUFFICIENT', 8_750_000],
  [30_000_000, 'CURRENT_PRICE_ALREADY_SUFFICIENT', 10_000_000],
  [40_000_000, 'PRICE_INCREASE_SUGGESTED', 11_666_667],
  [0, 'CURRENT_PRICE_ALREADY_SUFFICIENT', 7_000_000],
  [99_000_000, 'PRICE_INCREASE_SUGGESTED', 700_000_000],
] as const) {
  test(`editable margin ${margin} applies explicit conservative policy`, () => {
    const analysis = analyze({
      beforeCost: Money.fromDecimal('8'),
      afterCost: Money.fromDecimal('7'),
      price: '10',
    });
    const recommendation = recommendPurchasePrice(
      analysis,
      Percentage.fromScaledUnits(margin),
    );
    assert.equal(recommendation.status, status);
    assert.equal(recommendation.calculatedPrice.scaledUnits, units);
    assert.equal(
      recommendation.actionableSuggestedPrice.scaledUnits,
      status === 'PRICE_INCREASE_SUGGESTED' ? units : 10_000_000,
    );
  });
}

test('margin changes cross both ways without mutating the analysis', () => {
  const analysis = analyze({
    beforeCost: Money.fromDecimal('8'),
    afterCost: Money.fromDecimal('7'),
    price: '10',
  });
  for (const units of [20_000_000, 40_000_000, 20_000_000]) {
    assert.equal(
      recommendPurchasePrice(analysis, Percentage.fromScaledUnits(units))
        .status,
      units === 40_000_000
        ? 'PRICE_INCREASE_SUGGESTED'
        : 'CURRENT_PRICE_ALREADY_SUFFICIENT',
    );
  }
  assert.equal(analysis.regularSalePrice.scaledUnits, 10_000_000);
  assert.equal(analysis.currentUnitCost.scaledUnits, 7_000_000);
});

for (const units of [-1, 100_000_000, 101_000_000, Number.MAX_SAFE_INTEGER]) {
  test(`invalid target margin ${units} is unavailable`, () => {
    const analysis = analyze({
      beforeCost: Money.fromDecimal('10'),
      afterCost: Money.fromDecimal('12'),
    });
    assert.equal(
      recommendPurchasePrice(analysis, Percentage.fromScaledUnits(units))
        .status,
      'UNAVAILABLE',
    );
  });
}

for (const [beforeCost, afterCost, price] of [
  [null, '10', '15'],
  ['0', '10', '15'],
  ['10', '12', '0'],
  ['10', '10', '15'],
  ['10', '0', '15'],
  ['20', '22', '15'],
] as const) {
  test(`no invented initial margin for ${beforeCost}/${afterCost}/${price}`, () => {
    const analysis = analyze({
      beforeCost: beforeCost === null ? null : Money.fromDecimal(beforeCost),
      afterCost: Money.fromDecimal(afterCost),
      price,
    });
    assert.equal(getInitialPurchaseMargin(analysis), null);
    assert.equal(
      recommendPurchasePrice(analysis, Percentage.zero()).status,
      'UNAVAILABLE',
    );
  });
}

test('edited margin overflow is unavailable, not a rounded or clamped price', () => {
  const analysis = analyze({
    beforeCost: Money.fromDecimal('100'),
    afterCost: Money.fromDecimal('200'),
    price: '1000',
  });
  assert.equal(
    recommendPurchasePrice(analysis, Percentage.fromScaledUnits(99_999_999))
      .status,
    'UNAVAILABLE',
  );
});

test('pure Domain mathematics still permits a lower price', () => {
  assert.equal(
    suggestSalePriceForMargin({
      unitCost: Money.fromDecimal('6'),
      targetMargin: Percentage.fromScaledUnits(33_333_333),
    })?.scaledUnits,
    9_000_000,
  );
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
