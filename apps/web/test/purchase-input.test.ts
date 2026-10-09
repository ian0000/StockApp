import assert from 'node:assert/strict';
import { test } from 'node:test';
import { version } from 'uuid';
import type { PriceAnalysisDto } from '@stock-app/contracts';
import { createSchemaValidator, contractSchemas } from '@stock-app/contracts';
import {
  initialPurchaseForm,
  purchaseTotal,
  buildPurchase,
  initialMargin,
  desiredMargin,
  marginPresentation,
  priceUpdateDraft,
} from '../src/purchases/input.js';
import { buildUpdateCommand } from '../src/products/edit.js';
import { product } from './product-fixtures.js';
const form = {
  productId: product.product.id,
  quantity: '3',
  unitCost: '1.123456',
};
export const analysis: PriceAnalysisDto = {
  previousUnitCost: '2000000',
  currentUnitCost: '3000000',
  regularSalePrice: '3100000',
  previousMargin: '4000008',
  currentMargin: '4000000',
  suggestedSalePrice: null,
  costChanged: true,
};
test('Purchase has no selected Product or default cost and quantity1', () =>
  assert.deepEqual(initialPurchaseForm(), {
    productId: null,
    quantity: '1',
    unitCost: '',
  }));
test('Purchase exact six-decimal total and comma unit cost', () => {
  assert.equal(purchaseTotal(form).scaledUnits, 3370368);
  assert.equal(
    purchaseTotal({ ...form, unitCost: '1,123456' }).scaledUnits,
    3370368,
  );
});
for (const quantity of ['', '0', '-1', '1.5', '1e2', '9007199254740992'])
  test(`Purchase rejects quantity ${quantity}`, () =>
    assert.throws(() => purchaseTotal({ ...form, quantity })));
for (const unitCost of [
  '',
  '-1',
  '1e2',
  '1.0000001',
  '1,2.3',
  '9007199254.740992',
])
  test(`Purchase rejects cost ${unitCost}`, () =>
    assert.throws(() => purchaseTotal({ ...form, unitCost })));
test('zero cost is known and valid while overflow is rejected', () => {
  assert.equal(purchaseTotal({ ...form, unitCost: '0' }).scaledUnits, 0);
  assert.throws(() =>
    purchaseTotal({ ...form, unitCost: '9007199254.740991', quantity: '2' }),
  );
});
test('command captures exact fresh state revision string, null/zero cost and movement identity without metadata or operation ref', () => {
  for (const unitCost of [null, '0']) {
    const read = {
      ...product,
      state: {
        ...product.state,
        stateRevision: '9007199254740993',
        stock: -3,
        unitCost,
      },
    };
    const cmd = buildPurchase(form, read);
    createSchemaValidator(contractSchemas.RegisterPurchaseCommand)(cmd);
    assert.deepEqual(cmd.preconditions, {
      expectedStateRevision: read.state.stateRevision,
      expectedState: {
        stock: -3,
        unitCost,
        lastMovementId: read.state.lastMovementId,
      },
    });
    assert.equal(cmd.commandKind, 'PURCHASE_REGISTER');
    assert.equal(cmd.payload.unitCost, '1123456');
    assert.equal(cmd.payload.notes, null);
    assert.equal(cmd.payload.createdAt, cmd.occurredAt);
    assert.deepEqual(cmd.dependsOn, []);
    const ids = [
      cmd.operationId,
      cmd.payload.purchaseId,
      cmd.payload.movementId,
    ];
    assert.ok(ids.every((id) => version(id) === 7));
    assert.equal(new Set(ids).size, 3);
  }
});
test('missing/archived/foreign selected Product cannot build an intent', () => {
  assert.throws(() => buildPurchase(initialPurchaseForm(), product));
  assert.throws(() =>
    buildPurchase(form, {
      ...product,
      product: { ...product.product, isArchived: true },
    }),
  );
  assert.throws(() =>
    buildPurchase({ ...form, productId: 'foreign' }, product),
  );
});
test('initial margin preserves original4.000008 despite display4.00; explicit rewrite uses4.000000', () => {
  const draft = initialMargin(analysis);
  assert.deepEqual(draft, { text: '4.00', dirty: false });
  assert.equal(desiredMargin(analysis, draft)?.scaledUnits, 4000008);
  assert.equal(
    desiredMargin(analysis, { text: '4.00', dirty: true })?.scaledUnits,
    4000000,
  );
});
test('99.999999 shows100.00 untouched but rewriting100.00 is invalid', () => {
  const a = { ...analysis, previousMargin: '99999999' };
  const draft = initialMargin(a);
  assert.equal(draft.text, '100.00');
  assert.equal(desiredMargin(a, draft)?.scaledUnits, 99999999);
  assert.equal(desiredMargin(a, { ...draft, dirty: true }), null);
});
for (const text of ['0', '30', '30.5', '30,5', '.5', ',5', '99.999999'])
  test(`manual margin ${text} valid`, () =>
    assert.ok(desiredMargin(analysis, { text, dirty: true })));
for (const text of [
  '-1',
  '100',
  '1e2',
  '1,2.3',
  '1.1234567',
  '9007199254740992',
])
  test(`manual margin ${text} invalid`, () => {
    const p = marginPresentation(analysis, { text, dirty: true });
    assert.ok(p.error);
    assert.equal(p.recommendation.status, 'UNAVAILABLE');
  });
test('empty margin has no error and no recommendation', () => {
  const p = marginPresentation(analysis, { text: '', dirty: true });
  assert.equal(p.error, null);
  assert.equal(p.recommendation.status, 'UNAVAILABLE');
});
test('initial margin uses valid previous, else current, else empty; never arbitrary30', () => {
  assert.equal(
    initialMargin({ ...analysis, previousMargin: '-1' }).text,
    '4.00',
  );
  assert.equal(
    initialMargin({
      ...analysis,
      previousMargin: '-1',
      currentMargin: '100000000',
    }).text,
    '',
  );
});
test('cost0 disables editor, cost positive allows unchanged-cost and zero regular price without default', () => {
  assert.equal(
    marginPresentation(
      { ...analysis, currentUnitCost: '0' },
      initialMargin(analysis),
    ).eligible,
    false,
  );
  const a = {
    ...analysis,
    regularSalePrice: '0',
    previousMargin: null,
    currentMargin: null,
    costChanged: false,
  };
  const p = marginPresentation(a, initialMargin(a));
  assert.equal(p.eligible, true);
  assert.equal(p.recommendation.status, 'UNAVAILABLE');
});
test('Application recommendation uses exact desired margin and never recommends a price decrease', () => {
  const increase = marginPresentation(analysis, initialMargin(analysis));
  assert.equal(increase.recommendation.status, 'PRICE_INCREASE_SUGGESTED');
  const enough = marginPresentation(
    { ...analysis, regularSalePrice: '50000000' },
    { text: '10', dirty: true },
  );
  assert.equal(
    enough.recommendation.status,
    'CURRENT_PRICE_ALREADY_SUFFICIENT',
  );
  assert.equal(
    enough.recommendation.actionableSuggestedPrice.scaledUnits,
    50000000,
  );
});
test('price update preserves every metadata field/revision and exact recommendation, only price changes', () => {
  const result = { product: product.product, priceAnalysis: analysis };
  const draft = priceUpdateDraft(result, initialMargin(analysis));
  assert.ok(draft);
  const cmd = buildUpdateCommand(draft);
  assert.equal(cmd.commandKind, 'PRODUCT_UPDATE');
  assert.equal(version(cmd.operationId), 7);
  assert.equal(
    cmd.preconditions.expectedMetadataRevision,
    product.product.metadataRevision,
  );
  for (const field of ['name', 'variant', 'barcode', 'minimumStock'] as const)
    assert.equal(cmd.payload[field], product.product[field]);
  const rec = marginPresentation(
    analysis,
    initialMargin(analysis),
  ).recommendation;
  assert.ok(rec.status !== 'UNAVAILABLE');
  assert.equal(
    cmd.payload.regularSalePrice,
    String(rec.actionableSuggestedPrice.scaledUnits),
  );
  assert.equal(priceUpdateDraft(result, { text: '100', dirty: true }), null);
});
