import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { URL } from 'node:url';
import { isValidElement, type ReactElement, type ComponentProps } from 'react';
import ts from 'typescript';
import type { PurchaseConfirmation } from '../src/ui/purchases/PurchaseConfirmation';

import {
  createPurchasePriceAnalysis,
  type RegisterPurchaseResult,
} from '@stock-app/application';
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
import {
  createInitialPurchaseMarginText,
  createPurchaseMarginPresentation,
  parseDesiredMargin,
  resolvePurchaseDesiredMargin,
} from '../src/ui/purchases/purchase-margin-input';

test('initial margin display uses two decimals while untouched analysis uses original Percentage', () => {
  const original = Percentage.fromDecimal('4.000008');
  const purchase = result({ previousMargin: original });
  const text = createInitialPurchaseMarginText(purchase);
  assert.equal(text, '4.00');
  assert.strictEqual(
    resolvePurchaseDesiredMargin(purchase, text, false),
    original,
  );
  assert.equal(
    resolvePurchaseDesiredMargin(purchase, text, true)?.scaledUnits,
    4_000_000,
  );
  const untouched = createPurchaseMarginPresentation(
    purchase,
    text,
    'USD',
    false,
  );
  const expected = createPurchaseMarginPresentation(
    purchase,
    '4.000008',
    'USD',
  );
  assert.deepEqual(untouched.recommendation, expected.recommendation);
});

test('negative previous margin displays valid current reference and custom input calculates the physical example', () => {
  const purchase = result({
    previousMargin: Percentage.fromDecimal('-10'),
    currentMargin: Percentage.fromDecimal('2.43'),
    currentUnitCost: Money.fromDecimal('7.65'),
    regularSalePrice: Money.fromDecimal('7.84'),
  });
  assert.equal(createInitialPurchaseMarginText(purchase), '2.43');
  const presentation = createPurchaseMarginPresentation(purchase, '30', 'USD');
  assert.equal(presentation.isEligible, true);
  assert.equal(presentation.suggestedSalePriceLabel, 'USD 10.93');
});

test('no valid reference gives an available empty editor without an error or fictitious suggestion', () => {
  const purchase = result({
    previousMargin: null,
    currentMargin: null,
    regularSalePrice: Money.zero(),
  });
  assert.equal(createInitialPurchaseMarginText(purchase), '');
  const empty = createPurchaseMarginPresentation(purchase, '', 'USD', false);
  assert.equal(empty.isEligible, true);
  assert.equal(empty.errorMessage, null);
  assert.equal(empty.suggestedSalePriceLabel, null);
  assert.equal(
    createPurchaseMarginPresentation(purchase, '30', 'USD').recommendation
      .status,
    'PRICE_INCREASE_SUGGESTED',
  );
});

test('rounded display 100.00 does not invalidate an untouched reference below 100 percent', () => {
  const purchase = result({
    previousMargin: Percentage.fromDecimal('99.999999'),
    currentUnitCost: Money.fromDecimal('0.000001'),
  });
  const text = createInitialPurchaseMarginText(purchase);
  assert.equal(text, '100.00');
  assert.equal(
    resolvePurchaseDesiredMargin(purchase, text, false)?.scaledUnits,
    99_999_999,
  );
  assert.equal(
    createPurchaseMarginPresentation(purchase, text, 'USD', false).errorMessage,
    null,
  );
  assert.equal(resolvePurchaseDesiredMargin(purchase, text, true), null);
});

test('manual six-decimal margin still parses without changing display policy', () => {
  assert.equal(parseDesiredMargin('30.123456')?.scaledUnits, 30_123_456);
  assert.equal(parseDesiredMargin('30,123456')?.scaledUnits, 30_123_456);
});

const TIMESTAMP = 1_776_444_000_000;

// Exercise the actual confirmation tree with host primitives, without a native runtime/test library.
function loadConfirmation() {
  const path = new URL(
    '../src/ui/purchases/PurchaseConfirmation.tsx',
    import.meta.url,
  );
  const localRequire = createRequire(path);
  const module: {
    exports: { PurchaseConfirmation?: typeof PurchaseConfirmation };
  } = { exports: {} };
  const code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  runInNewContext(code, {
    module,
    exports: module.exports,
    require: (specifier: string): unknown =>
      specifier === 'react-native'
        ? {
            Text: 'Text',
            View: 'View',
            TextInput: 'TextInput',
            Pressable: 'Pressable',
            StyleSheet: { create: (styles: unknown) => styles },
          }
        : localRequire(specifier),
  });
  assert.ok(module.exports.PurchaseConfirmation);
  return module.exports.PurchaseConfirmation;
}

function elements(tree: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(tree)) return [];
  return [tree, ...elements(tree.props.children)];
}

test('confirmation shows only Keep for sufficient margin, and Update after editing above threshold', () => {
  const Confirmation = loadConfirmation();
  let text = '0';
  let accepted = 0;
  let kept = 0;
  const render = () =>
    elements(
      Confirmation({
        currency: 'USD',
        result: result(),
        desiredMarginText: text,
        desiredMarginIsDirty: true,
        priceDecision: 'pending',
        onChangeDesiredMargin: (value) => {
          text = value;
        },
        onGoProducts() {},
        onNewPurchase() {},
        onKeepPrice() {
          kept++;
        },
        onUseSuggestedPrice() {
          accepted++;
        },
      }),
    );
  let nodes = render();
  assert.equal(nodes.filter((node) => node.type === 'Pressable').length, 1);
  const input = nodes.find((node) => node.type === 'TextInput');
  assert.equal(
    input?.props.accessibilityLabel,
    'Margen deseado (% del precio de venta)',
  );
  const change = input?.props.onChangeText;
  assert.equal(typeof change, 'function');
  if (typeof change !== 'function') assert.fail('Missing editor callback');
  change('40');
  nodes = render();
  assert.equal(nodes.filter((node) => node.type === 'Pressable').length, 2);
  assert.equal(accepted, 0);
  assert.equal(kept, 0);
  change('20');
  assert.equal(render().filter((node) => node.type === 'Pressable').length, 1);
  change('100');
  assert.equal(render().filter((node) => node.type === 'Pressable').length, 1);
});

test('confirmation disables both actions and input while saving, and offers retry after failure', () => {
  const Confirmation = loadConfirmation();
  const props: ComponentProps<typeof PurchaseConfirmation> = {
    currency: 'USD',
    result: result(),
    desiredMarginText: '40',
    desiredMarginIsDirty: true,
    priceDecision: 'saving',
    onChangeDesiredMargin() {},
    onGoProducts() {},
    onNewPurchase() {},
    onKeepPrice() {},
    onUseSuggestedPrice() {},
  };
  const saving = elements(Confirmation(props));
  assert.equal(
    saving.find((node) => node.type === 'TextInput')?.props.editable,
    false,
  );
  assert.ok(
    saving
      .filter((node) => node.type === 'Pressable')
      .every((node) => node.props.disabled === true),
  );
  const failed = elements(Confirmation({ ...props, priceDecision: 'error' }));
  assert.ok(
    failed.some(
      (node) => node.props.children === 'Reintentar cambio de precio de venta',
    ),
  );
  for (const priceDecision of ['kept', 'applied'] as const) {
    assert.equal(
      elements(Confirmation({ ...props, priceDecision })).some(
        (node) => node.type === 'TextInput',
      ),
      false,
    );
  }
});

for (const [label, analysis] of [
  ['unchanged cost', { costChanged: false }],
  [
    'no initial reference',
    {
      previousMargin: null,
      currentMargin: null,
      regularSalePrice: Money.zero(),
    },
  ],
] as const) {
  test(`confirmation renders the editor for ${label}`, () => {
    const purchase = result(analysis);
    const Confirmation = loadConfirmation();
    const nodes = elements(
      Confirmation({
        currency: 'USD',
        result: purchase,
        priceDecision: 'pending',
        desiredMarginText: createInitialPurchaseMarginText(purchase),
        desiredMarginIsDirty: false,
        onChangeDesiredMargin() {},
        onGoProducts() {},
        onNewPurchase() {},
        onKeepPrice() {},
        onUseSuggestedPrice() {},
      }),
    );
    assert.ok(nodes.some((node) => node.type === 'TextInput'));
    if (label === 'no initial reference') {
      assert.equal(
        nodes.find((node) => node.type === 'TextInput')?.props.value,
        '',
      );
      assert.equal(nodes.filter((node) => node.type === 'Pressable').length, 1);
    }
  });
}

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
    createSuggestedPriceUpdateInput(
      result({ previousMargin: null, suggestedSalePrice: null }),
    ),
    null,
  );
});

test('initial input displays two decimals and falls back to the current margin', () => {
  assert.equal(createInitialPurchaseMarginText(result()), '33.33');
  assert.equal(
    createInitialPurchaseMarginText(result({ previousMargin: null })),
    '20.00',
  );
});

for (const [input, units] of [
  ['0', 0],
  ['30', 30_000_000],
  ['30,5', 30_500_000],
  ['30.5', 30_500_000],
  [',5', 500_000],
  ['.5', 500_000],
  [' 35 ', 35_000_000],
  ['99.999999', 99_999_999],
] as const) {
  test(`desired margin input accepts ${input} exactly`, () => {
    assert.equal(parseDesiredMargin(input)?.scaledUnits, units);
  });
}
for (const input of [
  '',
  ' ',
  'abc',
  '100',
  '101',
  '-1',
  '1e2',
  'Infinity',
  '9007199254740991',
  '0.1234567',
  '1,2.3',
  '1.2,3',
  '1,2,3',
  '.',
  ',',
]) {
  test(`desired margin input rejects ${JSON.stringify(input)}`, () => {
    assert.equal(parseDesiredMargin(input), null);
    const presentation = createPurchaseMarginPresentation(
      result(),
      input,
      'USD',
    );
    assert.equal(presentation.recommendation.status, 'UNAVAILABLE');
    assert.equal(presentation.errorMessage === null, input.trim() === '');
    assert.equal(presentation.suggestedSalePriceLabel, null);
  });
}

test('editing margin changes recommendation both ways without writes', () => {
  const purchaseResult = result();
  for (const [text, status] of [
    ['0', 'CURRENT_PRICE_ALREADY_SUFFICIENT'],
    ['40', 'PRICE_INCREASE_SUGGESTED'],
    ['20', 'CURRENT_PRICE_ALREADY_SUFFICIENT'],
  ] as const) {
    const presentation = createPurchaseMarginPresentation(
      purchaseResult,
      text,
      'USD',
    );
    assert.equal(presentation.recommendation.status, status);
    assert.equal(
      presentation.suggestedSalePriceLabel,
      status === 'PRICE_INCREASE_SUGGESTED' ? 'USD 20.00' : null,
    );
  }
  assert.equal(purchaseResult.product.regularSalePrice.scaledUnits, 15_000_000);
  assert.equal(purchaseResult.afterInventoryState.stock, 20);
  assert.equal(
    purchaseResult.afterInventoryState.unitCost?.scaledUnits,
    12_000_000,
  );
});

test('explicit acceptance uses edited Money precision, never the display string', async () => {
  const purchaseResult = result();
  const margin = parseDesiredMargin('30');
  let calls = 0;
  const updated = await applySuggestedPrice(
    purchaseResult,
    {
      async execute(input) {
        calls++;
        return {
          ...purchaseResult.product,
          regularSalePrice: input.regularSalePrice,
        };
      },
    },
    margin,
  );
  assert.equal(calls, 1);
  assert.equal(updated.regularSalePrice.scaledUnits, 17_142_857);
  assert.equal(purchaseResult.purchase.id, 'purchase-1');
});

test('sufficient, equal and invalid targets cannot write Product even if invoked', async () => {
  for (const margin of [
    Percentage.zero(),
    Percentage.fromDecimal('20'),
    null,
  ]) {
    let writes = 0;
    await assert.rejects(
      () =>
        applySuggestedPrice(
          result(),
          {
            async execute() {
              writes++;
              throw new Error('must not write');
            },
          },
          margin,
        ),
      /No suggested/,
    );
    assert.equal(writes, 0);
  }
});

test('cost decrease retains the current price and no lower CTA amount', () => {
  const original = result();
  const priceAnalysis = createPurchasePriceAnalysis({
    beforeInventoryState: createInventoryState({
      stock: 10,
      unitCost: Money.fromDecimal('8'),
    }),
    afterInventoryState: createInventoryState({
      stock: 20,
      unitCost: Money.fromDecimal('6'),
    }),
    regularSalePrice: Money.fromDecimal('12'),
  });
  const presentation = createPurchaseMarginPresentation(
    { ...original, priceAnalysis },
    '33.333333',
    'USD',
  );
  assert.equal(
    presentation.recommendation.status,
    'CURRENT_PRICE_ALREADY_SUFFICIENT',
  );
  assert.equal(presentation.suggestedSalePriceLabel, null);
  assert.equal(presentation.errorMessage, null);
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
