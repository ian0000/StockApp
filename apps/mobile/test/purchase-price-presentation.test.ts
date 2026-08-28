import assert from 'node:assert/strict';
import test from 'node:test';

import type { RegisterPurchaseResult } from '@stock-app/application';
import {
  createInventoryState,
  createProduct,
  createPurchase,
  Money,
  Percentage,
} from '@stock-app/domain';

import {
  applySuggestedPrice,
  createPurchasePricePresentation,
  createSuggestedPriceUpdateInput,
} from '../src/ui/purchases/purchase-price-presentation';

const TIMESTAMP = 1_776_444_000_000;

function result(
  overrides: Partial<RegisterPurchaseResult['priceAnalysis']> = {},
): RegisterPurchaseResult {
  const beforeInventoryState = createInventoryState({
    stock: 10,
    unitCost: Money.fromDecimal('10'),
  });
  const afterInventoryState = createInventoryState({
    stock: 20,
    unitCost: Money.fromDecimal('12'),
  });
  const product = createProduct({
    id: 'product-1',
    inventoryId: 'inventory-1',
    name: '  Coffee  ',
    variant: '  500 g  ',
    barcode: '0012345',
    regularSalePrice: Money.fromDecimal('15'),
    minimumStock: 3,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  });
  const purchase = createPurchase({
    id: 'purchase-1',
    inventoryId: 'inventory-1',
    productId: 'product-1',
    quantity: 10,
    unitCost: Money.fromDecimal('14'),
    totalAmount: Money.fromDecimal('140'),
    effectiveAt: TIMESTAMP,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    status: 'CONFIRMED',
    averageCostBefore: beforeInventoryState.unitCost,
    averageCostAfter: Money.fromDecimal('12'),
    stockBefore: 10,
    stockAfter: 20,
  });

  return Object.freeze({
    purchase,
    product,
    beforeInventoryState,
    afterInventoryState,
    priceAnalysis: Object.freeze({
      previousUnitCost: Money.fromDecimal('10'),
      currentUnitCost: Money.fromDecimal('12'),
      regularSalePrice: Money.fromDecimal('15'),
      previousMargin: Percentage.fromScaledUnits(33_333_333),
      currentMargin: Percentage.fromScaledUnits(20_000_000),
      suggestedSalePrice: Money.fromDecimal('18'),
      costChanged: true,
      ...overrides,
    }),
  });
}

test('presents changed cost, both margins and the transient suggestion', () => {
  const presentation = createPurchasePricePresentation(result(), 'USD');

  assert.deepEqual(presentation, {
    costChanged: true,
    previousCostLabel: 'USD 10.00',
    currentCostLabel: 'USD 12.00',
    regularSalePriceLabel: 'USD 15.00',
    previousMarginLabel: '33.33%',
    currentMarginLabel: '20.00%',
    suggestedSalePriceLabel: 'USD 18.00',
    hasPriceDecision: true,
  });
});

test('keeps unknown previous cost and margin unavailable', () => {
  const presentation = createPurchasePricePresentation(
    result({
      previousUnitCost: null,
      previousMargin: null,
      suggestedSalePrice: null,
    }),
    'USD',
  );

  assert.equal(presentation.previousCostLabel, 'No disponible');
  assert.equal(presentation.previousMarginLabel, 'No disponible');
  assert.equal(presentation.currentMarginLabel, '20.00%');
  assert.equal(presentation.hasPriceDecision, false);
});

test('unchanged cost keeps the confirmation free of a false decision', () => {
  const presentation = createPurchasePricePresentation(
    result({ costChanged: false, suggestedSalePrice: null }),
    'USD',
  );

  assert.equal(presentation.costChanged, false);
  assert.equal(presentation.hasPriceDecision, false);
});

test('suggested price update preserves all Product metadata', () => {
  const input = createSuggestedPriceUpdateInput(result());

  assert.deepEqual(input, {
    inventoryId: 'inventory-1',
    productId: 'product-1',
    name: 'Coffee',
    variant: '500 g',
    barcode: '0012345',
    regularSalePrice: Money.fromDecimal('18'),
    minimumStock: 3,
  });
  assert.equal('stock' in (input ?? {}), false);
  assert.equal('unitCost' in (input ?? {}), false);
});

test('does not create an update when there is no distinct suggestion', () => {
  assert.equal(
    createSuggestedPriceUpdateInput(result({ suggestedSalePrice: null })),
    null,
  );
});

test('a failed price update can retry only the Product update', async () => {
  const purchaseResult = result();
  const inputs: unknown[] = [];
  let attempts = 0;
  const updater = {
    async execute(
      input: NonNullable<ReturnType<typeof createSuggestedPriceUpdateInput>>,
    ) {
      attempts += 1;
      inputs.push(input);
      if (attempts === 1) throw new Error('controlled update failure');

      return Object.freeze({
        ...purchaseResult.product,
        regularSalePrice: input.regularSalePrice,
      });
    },
  };

  await assert.rejects(
    () => applySuggestedPrice(purchaseResult, updater),
    /controlled update failure/,
  );
  const updated = await applySuggestedPrice(purchaseResult, updater);

  assert.equal(attempts, 2);
  assert.deepEqual(inputs[0], inputs[1]);
  assert.equal(updated.regularSalePrice.scaledUnits, 18_000_000);
});
