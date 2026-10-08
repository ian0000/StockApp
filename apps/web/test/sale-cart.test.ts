import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Money } from '@stock-app/domain';
import { createSchemaValidator, contractSchemas } from '@stock-app/contracts';
import { version } from 'uuid';
import {
  addProduct,
  removeLine,
  changeQuantity,
  editPrice,
  cartTotal,
  prepareSale,
} from '../src/sales/cart.js';
import { product, operationId } from './product-fixtures.js';

const read = {
  ...product,
  product: { ...product.product, regularSalePrice: '1234567' },
  state: { ...product.state, stock: 10, unitCost: '24666667' },
};
const other = {
  ...read,
  product: { ...read.product, id: operationId },
  state: { ...read.state, productId: operationId, unitCost: null },
};
test('a positive one-micro price may display 0.00 but sends the exact positive semantic value', () => {
  const tiny = { ...read, product: { ...read.product, regularSalePrice: '1' } };
  const cart = addProduct([], tiny);
  assert.equal(cart[0].priceText, '0.00');
  assert.equal(cart[0].priceError, null);
  assert.equal(
    prepareSale(cart, [tiny]).command.payload.items[0].unitSalePrice,
    '1',
  );
});
test('unknown aggregate does not sum an overflowing partial known subset', () => {
  const high = {
    ...read,
    state: { ...read.state, unitCost: String(Number.MAX_SAFE_INTEGER) },
  };
  const secondKnown = {
    ...other,
    state: { ...other.state, unitCost: String(Number.MAX_SAFE_INTEGER) },
  };
  const unknown = {
    ...other,
    product: { ...other.product, id: '019e3000-0000-7000-8000-000000000099' },
    state: {
      ...other.state,
      productId: '019e3000-0000-7000-8000-000000000099',
    },
  };
  const cart = addProduct(
    addProduct(addProduct([], high), secondKnown),
    unknown,
  );
  const result = prepareSale(cart, [high, secondKnown, unknown]);
  assert.equal(
    result.command.preconditions.expectedCosts[2].estimatedCost,
    null,
  );
  assert.throws(() => prepareSale(cart.slice(0, 2), [high, secondKnown]));
});
test('negative stock remains allowed while a stock arithmetic overflow blocks the intent', () => {
  const lowest = {
    ...read,
    state: { ...read.state, stock: -Number.MAX_SAFE_INTEGER },
  };
  assert.throws(() => prepareSale(addProduct([], lowest), [lowest]));
});
test('empty cart has an exact zero total and cannot register', () => {
  assert.equal(cartTotal([]).scaledUnits, 0);
  assert.throws(() => prepareSale([], []));
});
test('exact financial subtotal and multi-line total use six-decimal source values', () => {
  const cart = changeQuantity(
    addProduct(addProduct([], read), other),
    read.product.id,
    1,
  );
  assert.equal(cartTotal(cart).scaledUnits, 3703701);
  assert.equal(
    cart[0].unitSalePrice.multiplyByInteger(cart[0].quantity).scaledUnits,
    2469134,
  );
});
test('exact financial known cost and negative profit evidence derive from refreshed cost and selected line price', () => {
  const cart = changeQuantity(addProduct([], read), read.product.id, 1);
  const { command } = prepareSale(cart, [read]);
  assert.deepEqual(command.preconditions.expectedCosts, [
    {
      productId: read.product.id,
      unitCostSnapshot: '24666667',
      estimatedCost: '49333334',
      estimatedProfit: '-46864200',
    },
  ]);
  assert.equal(command.payload.items[0].unitSalePrice, '1234567');
});
for (const cost of [null, '0', '1234567'] as const)
  test(`exact financial evidence for cost ${cost} preserves unknown versus known zero`, () => {
    const { command } = prepareSale(addProduct([], read), [
      { ...read, state: { ...read.state, unitCost: cost } },
    ]);
    const evidence = command.preconditions.expectedCosts[0];
    assert.equal(evidence.unitCostSnapshot, cost);
    assert.equal(evidence.estimatedCost, cost);
    assert.equal(
      evidence.estimatedProfit,
      cost === null ? null : cost === '0' ? '1234567' : '0',
    );
  });
test('quantity and duplicate addition preserve original price1234567 despite display1.23 and metadata refresh', () => {
  let cart = addProduct([], read);
  cart = changeQuantity(cart, read.product.id, 1);
  cart = addProduct(cart, {
    ...read,
    product: { ...read.product, regularSalePrice: '99000000' },
  });
  assert.equal(cart.length, 1);
  assert.equal(cart[0].quantity, 3);
  assert.equal(cart[0].priceText, '1.23');
  assert.equal(cart[0].priceDirty, false);
  assert.equal(
    prepareSale(cart, [read]).command.payload.items[0].unitSalePrice,
    '1234567',
  );
});
test('explicit same display edit becomes1230000, stays dirty and survives duplicate add', () => {
  let cart = editPrice(addProduct([], read), read.product.id, '1.23');
  cart = addProduct(cart, read);
  assert.equal(cart[0].priceDirty, true);
  assert.equal(cart[0].unitSalePrice.scaledUnits, 1230000);
  assert.equal(cart[0].priceText, '1.23');
  assert.equal(
    prepareSale(cart, [read]).command.payload.items[0].unitSalePrice,
    '1230000',
  );
});
test('comma input follows canonical UX and exact Domain precision', () =>
  assert.equal(
    editPrice(addProduct([], read), read.product.id, '1,123456')[0]
      .unitSalePrice.scaledUnits,
    1123456,
  ));
for (const text of [
  'abc',
  '',
  '-1',
  '0',
  '1.1234567',
  '1e3',
  '9007199254.740992',
])
  test(`invalid price ${text} preserves last semantic value and blocks send`, () => {
    const cart = editPrice(addProduct([], read), read.product.id, text);
    assert.equal(cart[0].unitSalePrice.scaledUnits, 1234567);
    assert.ok(cart[0].priceError);
    assert.throws(() => prepareSale(cart, [read]));
  });
test('zero-priced Product can be added but requires an explicit positive sale price', () => {
  const cart = addProduct([], {
    ...read,
    product: { ...read.product, regularSalePrice: '0' },
  });
  assert.equal(cart[0].priceText, '0.00');
  assert.ok(cart[0].priceError);
  assert.throws(() => prepareSale(cart, [read]));
  assert.doesNotThrow(() =>
    prepareSale(editPrice(cart, read.product.id, '1'), [read]),
  );
});
test('decrement1 removes, explicit remove works, quantity overflow refuses change', () => {
  const cart = addProduct(addProduct([], read), other);
  assert.deepEqual(changeQuantity(cart, read.product.id, -1), [cart[1]]);
  assert.deepEqual(removeLine(cart, other.product.id), [cart[0]]);
  assert.throws(() =>
    changeQuantity(
      [{ ...cart[0], quantity: Number.MAX_SAFE_INTEGER }],
      read.product.id,
      1,
    ),
  );
});
for (const stock of [3, 1, 0, -1])
  test(`stock ${stock} generates accurate warning only for a negative result`, () => {
    const { warnings } = prepareSale(addProduct([], read), [
      { ...read, state: { ...read.state, stock } },
    ]);
    assert.equal(warnings.length, stock < 1 ? 1 : 0);
    if (stock < 1)
      assert.deepEqual(warnings[0], {
        productId: read.product.id,
        name: read.product.name,
        stock,
        quantity: 1,
        resultingStock: stock - 1,
      });
  });
test('prepared multi-line command has unique v7 identities, one timestamp, notes null and only expectedCosts', () => {
  const { command } = prepareSale(addProduct(addProduct([], read), other), [
    read,
    other,
  ]);
  createSchemaValidator(contractSchemas.RegisterSaleCommand)(command);
  const ids = [
    command.operationId,
    command.payload.saleId,
    ...command.payload.items.flatMap((line) => [
      line.saleItemId,
      line.movementId,
    ]),
  ];
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => version(id) === 7));
  assert.equal(command.commandKind, 'SALE_REGISTER');
  assert.equal(command.occurredAt, command.payload.createdAt);
  assert.equal(command.payload.notes, null);
  assert.deepEqual(command.dependsOn, []);
  assert.deepEqual(Object.keys(command.preconditions), ['expectedCosts']);
  assert.ok(!('deviceId' in command) && !('supersedesOperationId' in command));
});
test('new preparation makes new IDs and never overwrites selected price from refreshed metadata', () => {
  const cart = editPrice(addProduct([], read), read.product.id, '3.765432');
  const latest = {
    ...read,
    product: { ...read.product, regularSalePrice: '50000000' },
  };
  const a = prepareSale(cart, [latest]),
    b = prepareSale(cart, [latest]);
  assert.notEqual(a.command.operationId, b.command.operationId);
  assert.equal(a.command.payload.items[0].unitSalePrice, '3765432');
});
test('duplicate or invalid quantity draft and absent/archived refreshed Product never build a command', () => {
  const cart = addProduct([], read);
  assert.throws(() => prepareSale([...cart, ...cart], [read]));
  for (const quantity of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => prepareSale([{ ...cart[0], quantity }], [read]));
  assert.throws(() => prepareSale(cart, []));
  assert.throws(() =>
    prepareSale(cart, [
      { ...read, product: { ...read.product, isArchived: true } },
    ]),
  );
});
test('financial overflow in subtotal, total or known cost blocks before sending', () => {
  const cart = addProduct([], {
    ...read,
    product: {
      ...read.product,
      regularSalePrice: String(Number.MAX_SAFE_INTEGER),
    },
  });
  assert.throws(() => cartTotal([{ ...cart[0], quantity: 2 }]));
  assert.throws(() =>
    cartTotal([...cart, { ...cart[0], productId: operationId }]),
  );
  assert.throws(() =>
    prepareSale(changeQuantity(addProduct([], read), read.product.id, 1), [
      {
        ...read,
        state: { ...read.state, unitCost: String(Number.MAX_SAFE_INTEGER) },
      },
    ]),
  );
  assert.ok(Money.fromScaledUnits(Number.MAX_SAFE_INTEGER));
});
