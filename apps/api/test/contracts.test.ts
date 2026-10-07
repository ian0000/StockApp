import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Pool } from 'pg';
import {
  contractSchemas,
  createSchemaValidator,
  routeContracts,
} from '@stock-app/contracts';
import { buildApp } from '../src/app.js';
import { createAuth } from '../src/auth/create-auth.js';
import { readAuthConfig } from '../src/auth/config.js';
import { createDatabase } from '../src/infrastructure/postgres/client.js';
import { registerSaleRoutes } from '../src/sales/routes.js';
import { registerPurchaseRoutes } from '../src/purchases/routes.js';
import { registerAdjustmentRoutes } from '../src/adjustments/routes.js';
import { registerVoidSaleRoutes } from '../src/void-sales/routes.js';
import { registerVoidPurchaseRoutes } from '../src/void-purchases/routes.js';
import { registerReadRoutes } from '../src/read-models/routes.js';
import { registerProductRoutes } from '../src/products/routes.js';
import { registerOwnershipRoutes } from '../src/ownership/routes.js';

test('implemented route schemas match the manifest and future routes remain absent without DB access', async (t) => {
  const pool = new Pool({
    connectionString: 'postgresql://postgres@127.0.0.1:1/unavailable',
    connectionTimeoutMillis: 50,
  });
  t.after(() => pool.end());
  let connections = 0;
  pool.on('connect', () => {
    connections++;
  });
  const database = createDatabase(pool);
  const runtime = createAuth({
    database,
    emailSender: {
      async send() {
        throw new Error('No email expected.');
      },
    },
    config: readAuthConfig({
      BETTER_AUTH_SECRET: 'fictional-contract-test-only-secret',
      AUTH_BASE_URL: 'http://127.0.0.1:3001',
      APP_ORIGIN: 'http://localhost:5173',
    }),
  });
  const app = buildApp();
  t.after(() => app.close());
  const registered = new Set<string>();
  app.addHook('onRoute', (options) => {
    const path = options.url.replace(/:([A-Za-z]+)/g, '{$1}');
    const contract = routeContracts.find(
      (route) =>
        route.path === path && route.method.toUpperCase() === options.method,
    );
    if (!contract) return;
    registered.add(contract.operationId);
    assert.equal(contract.implementationStatus, 'implemented');
    assert.ok(options.schema);
    if (contract.body)
      assert.deepEqual(options.schema.body, contractSchemas[contract.body]);
    if (contract.query)
      assert.deepEqual(
        options.schema.querystring,
        contractSchemas[contract.query],
      );
    if (contract.params)
      assert.deepEqual(options.schema.params, contractSchemas[contract.params]);
    for (const [status, schema] of Object.entries(contract.responses)) {
      if (Number(status) < 400) {
        assert.ok(options.schema.response);
        const responses: readonly [string, unknown][] = Object.entries(
          options.schema.response,
        );
        const response = responses.find(([code]) => code === status);
        assert.ok(response);
        assert.deepEqual(response[1], contractSchemas[schema]);
      }
    }
  });
  registerOwnershipRoutes(app, runtime.auth, database);
  registerProductRoutes(app, runtime.auth, database);
  registerSaleRoutes(app, runtime.auth, database);
  registerPurchaseRoutes(app, runtime.auth, database);
  registerAdjustmentRoutes(app, runtime.auth, database);
  registerVoidSaleRoutes(app, runtime.auth, database);
  registerVoidPurchaseRoutes(app, runtime.auth, database);
  registerReadRoutes(
    app,
    runtime.auth,
    database,
    'fictional-contract-test-only-secret',
  );
  await app.ready();
  assert.deepEqual(
    [...registered].sort(),
    routeContracts
      .filter(
        (route) =>
          route.implementationStatus === 'implemented' &&
          route.path !== '/live',
      )
      .map((route) => route.operationId)
      .sort(),
  );
  const live = await app.inject('/live');
  assert.equal(live.statusCode, 200);
  createSchemaValidator(contractSchemas.Live)(live.json());
  for (const path of ['/health', '/v1/me/export']) {
    const response = await app.inject(path);
    assert.equal(response.statusCode, 404);
    createSchemaValidator(contractSchemas.ApiError)(response.json());
  }
  const products = await app.inject(
    '/v1/inventories/019a0000-0000-7000-8000-000000000001/products',
  );
  assert.equal(products.statusCode, 401);
  createSchemaValidator(contractSchemas.ApiError)(products.json());
  assert.equal(products.json().error.code, 'UNAUTHENTICATED');
  assert.equal(connections, 0);
});
