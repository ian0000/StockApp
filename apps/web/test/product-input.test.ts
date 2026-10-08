import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatMoney,
  initialProductForm,
  parseProductForm,
  ProductFormError,
  buildProductCommand,
} from '../src/products/input.js';
import {
  PROTOCOL_VERSION,
  DOMAIN_VERSION,
} from '@stock-app/contracts/transport';
import { validate as isUuid, version } from 'uuid';

const form = (
  changes: Partial<ReturnType<typeof initialProductForm>> = {},
) => ({
  ...initialProductForm(),
  name: '  Agua  ',
  regularSalePrice: '1.123456',
  ...changes,
});

test('seven empty/default fields and barcode prefill preserve exact strings', () => {
  assert.deepEqual(initialProductForm('00123'), {
    name: '',
    variant: '',
    barcode: '00123',
    regularSalePrice: '',
    minimumStock: '',
    initialStock: '0',
    initialUnitCost: '',
  });
});
test('stock zero has null cost and null movement even with typed cost', () => {
  const command = buildProductCommand(form({ initialUnitCost: '12' }));
  assert.equal(command.payload.initialStock, 0);
  assert.equal(command.payload.initialUnitCost, null);
  assert.equal(command.payload.initialMovementId, null);
});
test('positive stock and six-decimal cost/price remain exact scaled strings', () => {
  const payload = parseProductForm(
    form({ initialStock: '10', initialUnitCost: '0.654321' }),
  );
  assert.equal(payload.initialUnitCost, '654321');
  assert.equal(payload.regularSalePrice, '1123456');
});
test('positive stock accepts known zero cost and zero price', () => {
  const payload = parseProductForm(
    form({ initialStock: '2', initialUnitCost: '0', regularSalePrice: '0' }),
  );
  assert.equal(payload.initialUnitCost, '0');
  assert.equal(payload.regularSalePrice, '0');
});
test('positive stock requires a known cost', () => {
  assert.throws(
    () => parseProductForm(form({ initialStock: '2' })),
    ProductFormError,
  );
});
for (const field of ['initialStock', 'minimumStock'] as const) {
  for (const value of ['-1', '1.5', '9007199254740992', 'Infinity', '1e2'])
    test(`${field} rejects unsafe/noninteger ${value}`, () =>
      assert.throws(
        () => parseProductForm(form({ [field]: value })),
        ProductFormError,
      ));
}
for (const value of [
  '',
  '-1',
  '0.1234567',
  '9007199254.740992',
  'private nonsense',
])
  test(`price rejects invalid ${value}`, () =>
    assert.throws(
      () => parseProductForm(form({ regularSalePrice: value })),
      ProductFormError,
    ));
test('name is required and whitespace is not a name', () =>
  assert.throws(
    () => parseProductForm(form({ name: '  ' })),
    ProductFormError,
  ));
test('name/variant/barcode are trimmed and empty optionals become null', () => {
  const payload = parseProductForm(form({ variant: '  ', barcode: '  ' }));
  assert.equal(payload.name, 'Agua');
  assert.equal(payload.variant, null);
  assert.equal(payload.barcode, null);
  assert.equal(
    parseProductForm(form({ barcode: ' 001 234 ' })).barcode,
    '001 234',
  );
});
test('minimum null and known zero stay distinct', () => {
  assert.equal(parseProductForm(form()).minimumStock, null);
  assert.equal(parseProductForm(form({ minimumStock: '0' })).minimumStock, 0);
});
test('new command has distinct UUIDv7 identities and imported protocol constants', () => {
  const command = buildProductCommand(
    form({ initialStock: '2', initialUnitCost: '1' }),
  );
  const ids = [
    command.operationId,
    command.payload.productId,
    command.payload.initialMovementId!,
  ];
  for (const id of ids) {
    assert.equal(isUuid(id), true);
    assert.equal(version(id), 7);
  }
  assert.equal(new Set(ids).size, 3);
  assert.equal(command.protocolVersion, PROTOCOL_VERSION);
  assert.equal(command.domainVersion, DOMAIN_VERSION);
  assert.equal(command.occurredAt, command.payload.createdAt);
  assert.deepEqual(command.preconditions, {});
  assert.deepEqual(command.dependsOn, []);
  assert.ok(!('deviceId' in command));
  assert.ok(!('supersedesOperationId' in command));
});
for (const [value, expected] of [
  ['0', '0.00'],
  ['1', '0.00'],
  ['1123456', '1.12'],
  ['1005000', '1.01'],
  ['-1005000', '-1.01'],
  ['9007199254740991', '9007199254.74'],
  [null, 'No disponible'],
] as const)
  test(`exact presentation ${value} without changing source`, () =>
    assert.equal(formatMoney(value), expected));
