import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  productParamsSchema,
  createSchemaValidator,
  routeContracts,
  generateOpenApi,
  uuidSchema,
} from '../src/index.js';

test('ProductParams accepts stored generic UUIDs including legacy v4 and rejects missing/extra/malformed parameters', () => {
  const validate = createSchemaValidator(productParamsSchema);
  const inventoryId = '550e8400-e29b-41d4-a716-446655440001',
    productId = '550e8400-e29b-41d4-a716-446655440000';
  validate({ inventoryId, productId });
  validate({
    inventoryId: inventoryId.toUpperCase(),
    productId: productId.toUpperCase(),
  });
  for (const value of [
    { inventoryId },
    { productId },
    { inventoryId, productId: 'bad' },
    { inventoryId, productId, stock: 3 },
  ])
    assert.throws(() => validate(value));
});
test('three Product commands are implemented with frozen 200 bodies, generic paths and required idempotency headers', () => {
  const document = generateOpenApi();
  for (const name of ['createProduct', 'updateProduct', 'archiveProduct']) {
    const route = routeContracts.find((r) => r.operationId === name)!;
    assert.equal(route.implementationStatus, 'implemented');
    assert.equal(
      route.params,
      name === 'createProduct' ? 'InventoryParams' : 'ProductParams',
    );
    const operation = document.paths[route.path][route.method]!;
    assert.equal(operation['x-stockapp-implementation-status'], 'implemented');
    for (const parameter of operation.parameters.filter((p) => p.in === 'path'))
      assert.deepEqual(parameter.schema, uuidSchema);
    assert.ok(
      operation.parameters.find(
        (p) => p.name === 'Idempotency-Key' && p.required,
      ),
    );
    assert.equal(
      route.responses[200],
      name === 'createProduct'
        ? 'CreateProductResult'
        : 'ProductMutationResult',
    );
  }
});
