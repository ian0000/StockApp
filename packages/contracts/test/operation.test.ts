import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createSchemaValidator,
  operationParamsSchema,
  uuidSchema,
  uuidV7Schema,
  routeContracts,
  generateOpenApi,
} from '../src/index.js';

const inventoryId = '550e8400-e29b-41d4-a716-446655440000';
const operationId = '019a0000-0000-7000-8000-000000000001';
test('OperationParams explicitly requires generic Inventory UUID and v7 operation UUID', () => {
  const validate = createSchemaValidator(operationParamsSchema);
  validate({ inventoryId, operationId });
  for (const params of [
    { inventoryId },
    { operationId },
    { inventoryId, operationId: inventoryId },
    { inventoryId: 'malformed', operationId },
    { inventoryId, operationId, owner: 'extra' },
  ])
    assert.throws(() => validate(params), TypeError);
});
test('getOperation is implemented with both parameters, OperationReceipt 200 and ApiError 404; remaining commands stay planned', () => {
  const route = routeContracts.find(
    (candidate) => candidate.operationId === 'getOperation',
  );
  assert.ok(route);
  assert.equal(route.implementationStatus, 'implemented');
  assert.equal(route.params, 'OperationParams');
  assert.equal(route.query, 'NoQuery');
  assert.equal(route.responses[200], 'OperationReceipt');
  assert.equal(route.responses[404], 'ApiError');
  const operation = generateOpenApi().paths[route.path]?.get;
  assert.ok(operation);
  assert.equal(operation['x-stockapp-implementation-status'], 'implemented');
  assert.deepEqual(
    operation.parameters.find((parameter) => parameter.name === 'inventoryId')
      ?.schema,
    uuidSchema,
  );
  assert.deepEqual(
    operation.parameters.find((parameter) => parameter.name === 'operationId')
      ?.schema,
    uuidV7Schema,
  );
  assert.deepEqual(
    operation.responses[200]?.content['application/json'].schema,
    { $ref: '#/components/schemas/OperationReceipt' },
  );
  assert.deepEqual(
    operation.responses[404]?.content['application/json'].schema,
    { $ref: '#/components/schemas/ApiError' },
  );
  for (const candidate of routeContracts.filter(
    (entry) =>
      (entry.command &&
        ![
          'createProduct',
          'updateProduct',
          'archiveProduct',
          'registerSale',
          'registerPurchase',
          'adjustStock',
          'voidSale',
          'voidPurchase',
          'getDashboard',
          'listProducts',
          'getProductByBarcode',
          'getProduct',
          'listLowStock',
          'getSale',
          'getPurchase',
          'listHistory',
        ].includes(entry.operationId)) ||
      entry.operationId.startsWith('sync') ||
      entry.operationId === 'health',
  ))
    assert.equal(candidate.implementationStatus, 'planned');
});
