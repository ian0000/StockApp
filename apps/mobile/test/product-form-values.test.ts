import assert from 'node:assert/strict';
import test from 'node:test';

import { Money } from '@stock-app/domain';

import {
  formatMoneyForDisplay,
  normalizeMoneyInput,
  parseProductFormValues,
  type ProductFormValues,
} from '../src/ui/products/product-form-values';

function validValues(
  overrides: Partial<ProductFormValues> = {},
): ProductFormValues {
  return {
    name: 'Coca-Cola',
    variant: '500 ml',
    barcode: '0012345',
    regularSalePrice: '1.00',
    initialStock: '10',
    initialUnitCost: '0.70',
    minimumStock: '2',
    ...overrides,
  };
}

test('parses valid Product form values without floating point conversion', () => {
  const result = parseProductFormValues(validValues());

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.input.regularSalePrice.scaledUnits, 1_000_000);
    assert.equal(result.input.initialUnitCost?.scaledUnits, 700_000);
    assert.equal(result.input.initialStock, 10);
    assert.equal(result.input.minimumStock, 2);
  }
});

test('normalizes comma and leading-separator money inputs', () => {
  const examples = [
    ['0,5', '0.5'],
    [',5', '0.5'],
    ['0.5', '0.5'],
    ['.5', '0.5'],
    ['1,25', '1.25'],
    ['1.25', '1.25'],
    ['0,00', '0.00'],
    ['0', '0'],
    ['10', '10'],
    ['0,123456', '0.123456'],
    ['0.123456', '0.123456'],
  ] as const;

  for (const [input, expected] of examples) {
    assert.equal(normalizeMoneyInput(input), expected, input);
  }
});

test('rejects malformed money input during normalization', () => {
  for (const input of [
    '',
    ',',
    '.',
    '1,2,3',
    '1.2.3',
    '1,2.3',
    '1.2,3',
    'abc',
  ]) {
    assert.equal(normalizeMoneyInput(input), null, input);
  }
});

test('accepts comma decimals for price and positive-stock initial cost', () => {
  const result = parseProductFormValues(
    validValues({ regularSalePrice: '0,5', initialUnitCost: '0,5' }),
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.input.regularSalePrice.scaledUnits, 500_000);
    assert.equal(result.input.initialUnitCost?.scaledUnits, 500_000);
  }
});

test('keeps Money six-decimal precision after comma normalization', () => {
  const result = parseProductFormValues(
    validValues({
      regularSalePrice: '0,123456',
      initialUnitCost: '0.123456',
    }),
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.input.regularSalePrice.scaledUnits, 123_456);
    assert.equal(result.input.initialUnitCost?.scaledUnits, 123_456);
  }
});

test('continues rejecting money input with more than six decimals', () => {
  assert.deepEqual(
    parseProductFormValues(validValues({ regularSalePrice: '0,1234567' })),
    { ok: false, message: 'Usa un precio habitual válido.' },
  );

  assert.deepEqual(
    parseProductFormValues(validValues({ initialUnitCost: '0.1234567' })),
    { ok: false, message: 'Usa un costo inicial válido.' },
  );
});

test('preserves leading zeroes in barcode text', () => {
  const result = parseProductFormValues(validValues({ barcode: '0012345' }));

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.input.barcode, '0012345');
  }
});

test('rejects an empty Product name with a useful message', () => {
  assert.deepEqual(parseProductFormValues(validValues({ name: '   ' })), {
    ok: false,
    message: 'Ingresa un nombre.',
  });
});

test('rejects an invalid regular sale price', () => {
  assert.deepEqual(
    parseProductFormValues(validValues({ regularSalePrice: '1.2.3' })),
    { ok: false, message: 'Usa un precio habitual válido.' },
  );
});

test('rejects a negative regular sale price', () => {
  assert.deepEqual(
    parseProductFormValues(validValues({ regularSalePrice: '-1' })),
    { ok: false, message: 'Usa un precio habitual válido.' },
  );
});

test('rejects fractional, negative, and unsafe initial stock', () => {
  for (const initialStock of ['1.5', '-1', 'abc', '9007199254740992']) {
    assert.deepEqual(parseProductFormValues(validValues({ initialStock })), {
      ok: false,
      message: 'Usa un stock inicial entero y no negativo.',
    });
  }
});

test('requires initial unit cost for positive initial stock', () => {
  assert.deepEqual(
    parseProductFormValues(validValues({ initialUnitCost: '' })),
    {
      ok: false,
      message: 'El costo es obligatorio cuando hay stock inicial.',
    },
  );
});

test('accepts a known zero initial cost for positive stock', () => {
  const result = parseProductFormValues(validValues({ initialUnitCost: '0' }));

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.input.initialUnitCost?.scaledUnits, 0);
  }
});

test('uses null cost when initial stock is zero', () => {
  const result = parseProductFormValues(
    validValues({ initialStock: '0', initialUnitCost: '' }),
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.input.initialUnitCost, null);
  }
});

test('keeps an empty minimum stock as null instead of zero', () => {
  const result = parseProductFormValues(validValues({ minimumStock: '' }));

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.input.minimumStock, null);
  }
});

test('rejects invalid minimum stock', () => {
  for (const minimumStock of ['-1', '1.5', 'abc', '9007199254740992']) {
    assert.deepEqual(parseProductFormValues(validValues({ minimumStock })), {
      ok: false,
      message: 'Usa un stock mínimo entero y no negativo.',
    });
  }
});

test('formats Money with two display decimals without changing Money', () => {
  const money = Money.fromDecimal('10.666667');

  assert.equal(formatMoneyForDisplay(money, 'USD'), 'USD 10.67');
  assert.equal(money.scaledUnits, 10_666_667);
});

test('display formatting rounds an exact half away from zero', () => {
  assert.equal(
    formatMoneyForDisplay(Money.fromDecimal('1.005'), 'USD'),
    'USD 1.01',
  );
  assert.equal(
    formatMoneyForDisplay(Money.fromDecimal('-1.005'), 'USD'),
    'USD -1.01',
  );
});
