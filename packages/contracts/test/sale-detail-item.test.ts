import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contractSchemas, createSchemaValidator } from '../src/index.js';

const id = '550e8400-e29b-41d4-a716-446655440000';
const common = {
  id,
  inventoryId: id,
  saleId: id,
  productId: id,
  quantity: 2,
  unitSalePrice: '15000000',
  subtotal: '30000000',
  createdAt: 1000,
  updatedAt: 1000,
};
const known = {
  ...common,
  costStatus: 'KNOWN',
  unitCostSnapshot: '10000000',
  estimatedCost: '20000000',
  estimatedProfit: '10000000',
};
const unknown = {
  ...common,
  costStatus: 'UNKNOWN',
  unitCostSnapshot: null,
  estimatedCost: null,
  estimatedProfit: null,
};
for (const [label, item] of [
  ['known', known],
  ['unknown', unknown],
] as const)
  test(`SaleDetailItem ${label} preserves financial fields and nullable current metadata`, () => {
    const validate = createSchemaValidator(contractSchemas.SaleDetailItem);
    for (const productName of ['Current name', null])
      for (const productVariant of ['Current variant', null])
        assert.doesNotThrow(() =>
          validate({ ...item, productName, productVariant }),
        );
    assert.throws(
      () =>
        validate({
          ...item,
          productName: 'Current',
          productVariant: null,
          extra: true,
        }),
      TypeError,
    );
    assert.throws(
      () => validate({ ...item, productName: '', productVariant: null }),
      TypeError,
    );
    assert.throws(() => validate({ ...item, productName: null }), TypeError);
    assert.throws(
      () =>
        createSchemaValidator(contractSchemas.SaleItem)({
          ...item,
          productName: 'Current',
          productVariant: null,
        }),
      TypeError,
    );
    assert.doesNotThrow(() =>
      createSchemaValidator(contractSchemas.SaleItem)(item),
    );
  });
test('SaleDetail enrichment does not enter command results or Sync financial items', () => {
  const enriched = { ...known, productName: 'Current', productVariant: null };
  const sale = {
    id,
    inventoryId: id,
    status: 'VOIDED',
    totalAmount: '30000000',
    estimatedCost: '20000000',
    estimatedProfit: '10000000',
    notes: null,
    effectiveAt: 900,
    createdAt: 1000,
    updatedAt: 1600,
  };
  assert.doesNotThrow(() =>
    createSchemaValidator(contractSchemas.SaleDetail)({
      sale,
      items: [enriched],
      voidEligibility: { eligible: false, reason: null },
    }),
  );
  assert.throws(
    () =>
      createSchemaValidator(contractSchemas.SaleDetail)({
        sale,
        items: [known],
        voidEligibility: { eligible: false, reason: null },
      }),
    TypeError,
  );
  assert.throws(
    () =>
      createSchemaValidator(contractSchemas.RegisterSaleResult)({
        sale: { ...sale, status: 'CONFIRMED' },
        items: [enriched],
        movements: [],
        states: [],
        committedRevision: '1',
        serverRecordedAt: 2000,
      }),
    TypeError,
  );
  assert.throws(
    () =>
      createSchemaValidator(contractSchemas.ChangeSet)({
        inventoryId: id,
        revision: '1',
        serverRecordedAt: 2000,
        upserts: {
          products: [],
          inventoryStates: [],
          sales: [],
          saleItems: [enriched],
          purchases: [],
          stockAdjustments: [],
          inventoryMovements: [],
        },
        tombstones: [],
      }),
    TypeError,
  );
});
