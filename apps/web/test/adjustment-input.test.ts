import assert from 'node:assert/strict';
import { test } from 'node:test';
import { version } from 'uuid';
import { product } from './product-fixtures.js';
import {
  initialAdjustmentForm,
  adjustmentPreview,
  buildAdjustment,
  reasonOptions,
} from '../src/adjustments/input.js';
const read = (stock = 10, unitCost: string | null = '10000000') => ({
  ...product,
  state: {
    ...product.state,
    stock,
    unitCost,
    stateRevision: '9007199254740993',
  },
});
const form = (actualStock = '12') => ({
  ...initialAdjustmentForm(read()),
  productId: product.product.id,
  actualStock,
});
for (const text of [
  '',
  '-1',
  '1.5',
  '1e2',
  'NaN',
  'Infinity',
  '9007199254740992',
])
  test(`reject invalid physical count ${text} before building command`, () =>
    assert.throws(() => buildAdjustment(form(text), read())));
for (const [before, actual, difference] of [
  [15, 13, -2],
  [5, 9, 4],
  [-3, 0, 3],
  [10, 0, -10],
])
  test(`physical final count ${before} to ${actual} derives ${difference}`, () => {
    const preview = adjustmentPreview(form(String(actual)), read(before));
    assert.equal(preview.difference, difference);
    assert.equal(preview.actualStock, actual);
  });
test('defaults keep count and custom cost empty, unknown cost selects CUSTOM', () => {
  assert.equal(initialAdjustmentForm(read()).actualStock, '');
  assert.equal(initialAdjustmentForm(read()).customUnitCost, '');
  assert.equal(initialAdjustmentForm(read()).costMode, 'USE_CURRENT_COST');
  assert.equal(initialAdjustmentForm(read(-3, null)).costMode, 'CUSTOM_COST');
  assert.equal(
    initialAdjustmentForm(read(0, '0')).costMode,
    'USE_CURRENT_COST',
  );
});
test('no product, zero difference and unsafe subtraction cannot create intent', () => {
  assert.throws(() => buildAdjustment(initialAdjustmentForm(), read()));
  assert.equal(adjustmentPreview(form('10'), read()).difference, 0);
  assert.throws(() => buildAdjustment(form('10'), read()));
  assert.throws(() =>
    buildAdjustment(form('9007199254740991'), read(-1, null)),
  );
});
test('positive reasons filtered; negative permits all five; OTHER needs no notes', () => {
  assert.equal(reasonOptions(1).length, 2);
  assert.equal(reasonOptions(-1).length, 5);
  assert.throws(() =>
    buildAdjustment({ ...form(), reason: 'DAMAGED' }, read()),
  );
  assert.equal(
    buildAdjustment({ ...form(), reason: 'OTHER' }, read()).payload.reason,
    'OTHER',
  );
  for (const { value } of reasonOptions(-1))
    assert.equal(
      buildAdjustment({ ...form('8'), reason: value }, read()).payload.reason,
      value,
    );
});
for (const [text, expected] of [
  ['0', '0'],
  ['1.123456', '1123456'],
  ['1,123456', '1123456'],
])
  test(`custom accepted cost exact ${text}`, () =>
    assert.equal(
      buildAdjustment(
        { ...form(), costMode: 'CUSTOM_COST', customUnitCost: text },
        read(),
      ).payload.customUnitCost,
      expected,
    ));
for (const text of ['', '-1', '1.1234567', '1e2', '9007199254.740992'])
  test(`reject custom cost ${text}`, () =>
    assert.throws(() =>
      buildAdjustment(
        { ...form(), costMode: 'CUSTOM_COST', customUnitCost: text },
        read(),
      ),
    ));
test('current known zero valid; unknown cannot become zero; negative cost input never leaks', () => {
  assert.equal(adjustmentPreview(form(), read(10, '0')).unitCost, '0');
  assert.throws(() => buildAdjustment(form('0'), read(-3, null)));
  const command = buildAdjustment(
    { ...form('8'), costMode: 'CUSTOM_COST', customUnitCost: '12.123456' },
    read(),
  );
  assert.equal(command.payload.costMode, null);
  assert.equal(command.payload.customUnitCost, null);
});
test('exact command IDs, timestamp, revision and state; no derived delta or metadata', () => {
  const command = buildAdjustment(form(), read());
  assert.equal(command.commandKind, 'STOCK_ADJUST');
  for (const id of [
    command.operationId,
    command.payload.stockAdjustmentId,
    command.payload.movementId,
  ])
    assert.equal(version(id), 7);
  assert.equal(
    new Set([
      command.operationId,
      command.payload.stockAdjustmentId,
      command.payload.movementId,
    ]).size,
    3,
  );
  assert.equal(command.occurredAt, command.payload.createdAt);
  assert.deepEqual(command.dependsOn, []);
  assert.equal(command.preconditions.expectedStateRevision, '9007199254740993');
  assert.deepEqual(command.preconditions.expectedState, {
    stock: 10,
    unitCost: '10000000',
    lastMovementId: null,
  });
  assert.deepEqual(
    Object.keys(command.payload).sort(),
    [
      'stockAdjustmentId',
      'movementId',
      'createdAt',
      'productId',
      'actualStock',
      'reason',
      'costMode',
      'customUnitCost',
    ].sort(),
  );
});
