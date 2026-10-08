import assert from 'node:assert/strict';
import { test } from 'node:test';
import { version } from 'uuid';
import { createSchemaValidator, contractSchemas } from '@stock-app/contracts';
import {
  initialEditDraft,
  editField,
  rebaseDraft,
  buildUpdateCommand,
  buildArchiveCommand,
  formatPercentage,
  metadataFields,
} from '../src/products/edit.js';
import { product } from './product-fixtures.js';

test('metadata edit preserves exact original values and a bigint revision beyond JS safe integers', () => {
  const original = {
    ...product.product,
    regularSalePrice: '1234567',
    metadataRevision: '9223372036854775806',
  };
  const draft = editField(initialEditDraft(original), 'name', '  Agua nueva  ');
  assert.equal(draft.text.regularSalePrice, '1.23');
  const command = buildUpdateCommand(draft);
  createSchemaValidator(contractSchemas.UpdateProductCommand)(command);
  assert.equal(command.payload.regularSalePrice, '1234567');
  assert.equal(command.payload.name, 'Agua nueva');
  assert.equal(
    command.preconditions.expectedMetadataRevision,
    original.metadataRevision,
  );
  assert.equal(version(command.operationId), 7);
  assert.equal(command.commandKind, 'PRODUCT_UPDATE');
  assert.deepEqual(Object.keys(command.payload).sort(), [
    'barcode',
    'minimumStock',
    'name',
    'productId',
    'regularSalePrice',
    'variant',
  ]);
  assert.deepEqual(command.dependsOn, []);
  assert.ok(!('deviceId' in command) && !('supersedesOperationId' in command));
});
test('explicitly retyping the same visible rounded price is dirty and parses a new exact value', () => {
  const draft = initialEditDraft({
    ...product.product,
    regularSalePrice: '1234567',
  });
  const changed = editField(
    draft,
    'regularSalePrice',
    draft.text.regularSalePrice,
  );
  assert.equal(changed.dirty.regularSalePrice, true);
  assert.equal(buildUpdateCommand(changed).payload.regularSalePrice, '1230000');
  assert.equal(draft.original.regularSalePrice, '1234567');
});
for (const [text, exact] of [
  ['0', '0'],
  ['1.123456', '1123456'],
  ['9007199254.740991', '9007199254740991'],
] as const)
  test(`edited valid price ${text} uses Domain six-decimal precision`, () =>
    assert.equal(
      buildUpdateCommand(
        editField(initialEditDraft(product.product), 'regularSalePrice', text),
      ).payload.regularSalePrice,
      exact,
    ));
for (const [field, text] of [
  ['name', ' '],
  ['regularSalePrice', '-1'],
  ['regularSalePrice', '1.1234567'],
  ['regularSalePrice', '1e3'],
  ['regularSalePrice', 'abc'],
  ['minimumStock', '-1'],
  ['minimumStock', '1.2'],
  ['minimumStock', '9007199254740992'],
] as const)
  test(`invalid edited ${field}:${text} refuses a command`, () =>
    assert.throws(() =>
      buildUpdateCommand(
        editField(initialEditDraft(product.product), field, text),
      ),
    ));
for (const field of metadataFields)
  test(`explicit rebase preserves dirty ${field} and takes untouched metadata from the latest Product`, () => {
    const draft = editField(initialEditDraft(product.product), field, 'local');
    const latest = {
      ...product.product,
      name: 'Latest',
      variant: 'Latest variant',
      barcode: '0099',
      regularSalePrice: '2345678',
      minimumStock: 15,
      metadataRevision: '25',
    };
    const next = rebaseDraft(draft, latest),
      fresh = initialEditDraft(latest);
    assert.equal(next.original, latest);
    for (const key of metadataFields) {
      assert.equal(next.text[key], key === field ? 'local' : fresh.text[key]);
      assert.equal(next.dirty[key], key === field);
    }
  });
test('discard resets all dirty flags and loads latest exact originals; normalization keeps barcode zeros', () => {
  let draft = initialEditDraft(product.product);
  draft = editField(draft, 'variant', ' ');
  draft = editField(draft, 'barcode', ' 0009 ');
  draft = editField(draft, 'minimumStock', ' ');
  const command = buildUpdateCommand(draft);
  assert.equal(command.payload.variant, null);
  assert.equal(command.payload.barcode, '0009');
  assert.equal(command.payload.minimumStock, null);
  const fresh = initialEditDraft({ ...product.product, metadataRevision: '2' });
  assert.ok(Object.values(fresh.dirty).every((dirty) => !dirty));
  assert.equal(
    buildUpdateCommand(fresh).payload.regularSalePrice,
    product.product.regularSalePrice,
  );
});
test('archive contains only identity and exact metadata precondition with a fresh operation for each explicit confirmation', () => {
  const original = {
    ...product.product,
    metadataRevision: '9223372036854775806',
  };
  const command = buildArchiveCommand(original),
    next = buildArchiveCommand(original);
  createSchemaValidator(contractSchemas.ArchiveProductCommand)(command);
  assert.equal(version(command.operationId), 7);
  assert.notEqual(command.operationId, next.operationId);
  assert.deepEqual(command.payload, { productId: original.id });
  assert.deepEqual(command.preconditions, {
    expectedMetadataRevision: original.metadataRevision,
  });
});
for (const [value, expected] of [
  [null, 'No disponible'],
  ['0', '0.00%'],
  ['12345678', '12.35%'],
  ['-12345678', '-12.35%'],
  ['4999', '0.00%'],
  ['5000', '0.01%'],
  ['-5000', '-0.01%'],
] as const)
  test(`Percentage display ${value} preserves null, zero, signs and exact rounding`, () =>
    assert.equal(formatPercentage(value), expected));
