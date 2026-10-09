import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { build } from 'vite';
import {
  apiErrorSchema,
  createSchemaValidator,
  contractSchemas,
} from '@stock-app/contracts';
import validateBrowserError from '../src/api/generated/api-error.mjs';
import {
  buildProductCommand,
  initialProductForm,
} from '../src/products/input.js';
import { product, strictResult, receipt } from './product-fixtures.js';
import { prepareSale } from '../src/sales/cart.js';
import { buildPurchase } from '../src/purchases/input.js';
import {
  purchaseProduct,
  purchaseForm,
  purchaseResult,
  purchaseDetail,
} from './purchase-fixtures.js';
import {
  initialCart,
  saleProduct,
  saleResult,
  saleDetail,
} from './sale-fixtures.js';
import {
  buildUpdateCommand,
  buildArchiveCommand,
  initialEditDraft,
} from '../src/products/edit.js';

test('standalone browser validation follows the shared schema and runs with dynamic code generation prohibited', async () => {
  const shared = createSchemaValidator(apiErrorSchema);
  for (const code of apiErrorSchema.properties.error.properties.code.enum) {
    const body = {
      error: { code, message: 'Mensaje público', requestId: 'r1' },
    };
    assert.doesNotThrow(() => shared(body));
    assert.equal(validateBrowserError(body), true);
  }
  const source = await readFile(
    new URL('../src/api/generated/api-error.mjs', import.meta.url),
    'utf8',
  );
  // Only strip ESM export syntax for the VM probe; the generated function is unchanged.
  const functionName = source.match(/export default (validate\d+);/)?.[1];
  assert.ok(functionName);
  const executable =
    source.replace(
      /export (?:const validate = validate\d+;|default validate\d+;)/g,
      '',
    ) +
    `\n${functionName}({error:{code:"NOT_FOUND",message:"Mensaje",requestId:"r1"}})`;
  const context = createContext(
    {},
    { codeGeneration: { strings: false, wasm: false } },
  );
  assert.equal(runInContext(executable, context), true);
  for (const body of [
    {},
    { error: { code: 'NOT_FOUND', message: '', requestId: 'r' } },
    {
      error: {
        code: 'NOT_FOUND',
        message: 'm',
        requestId: 'r',
        stack: 'private',
      },
    },
  ]) {
    assert.throws(() => shared(body));
    assert.equal(validateBrowserError(body), false);
  }
});

test('all Product/Sale/recovery standalone validators retain shared strict schemas under CSP', async () => {
  const command = buildProductCommand({
    ...initialProductForm(),
    name: 'Agua',
    regularSalePrice: '0',
  });
  const sale = prepareSale(initialCart(), [saleProduct]).command;
  const purchase = buildPurchase(purchaseForm(), purchaseProduct);
  for (const [name, schema, value] of [
    [
      'product-page',
      contractSchemas.ProductPage,
      { items: [product], nextCursor: null },
    ],
    ['product-read', contractSchemas.ProductRead, product],
    ['register-sale-command', contractSchemas.RegisterSaleCommand, sale],
    [
      'register-sale-result',
      contractSchemas.RegisterSaleResult,
      saleResult(sale),
    ],
    ['sale-detail', contractSchemas.SaleDetail, saleDetail(sale)],
    [
      'register-purchase-command',
      contractSchemas.RegisterPurchaseCommand,
      purchase,
    ],
    [
      'register-purchase-result',
      contractSchemas.RegisterPurchaseResult,
      purchaseResult(purchase),
    ],
    [
      'purchase-detail',
      contractSchemas.PurchaseDetail,
      purchaseDetail(purchase),
    ],
    [
      'update-product-command',
      contractSchemas.UpdateProductCommand,
      buildUpdateCommand(initialEditDraft(product.product)),
    ],
    [
      'archive-product-command',
      contractSchemas.ArchiveProductCommand,
      buildArchiveCommand(product.product),
    ],
    [
      'product-mutation-result',
      contractSchemas.ProductMutationResult,
      { product: product.product, committedRevision: '1', serverRecordedAt: 1 },
    ],
    ['create-product-command', contractSchemas.CreateProductCommand, command],
    [
      'create-product-result',
      contractSchemas.CreateProductResult,
      strictResult(command),
    ],
    [
      'operation-receipt',
      contractSchemas.OperationReceipt,
      receipt('ACCEPTED'),
    ],
  ] as const) {
    const shared = createSchemaValidator(schema);
    shared(value);
    const source = await readFile(
      new URL(`../src/api/generated/${name}.mjs`, import.meta.url),
      'utf8',
    );
    const functionName = source.match(/export default (validate\d+);/)?.[1];
    assert.ok(functionName);
    const executable =
      source.replace(
        /export (?:const validate = validate\d+;|default validate\d+;)/g,
        '',
      ) + `\n${functionName}(input)`;
    for (const [input, expected] of [
      [value, true],
      [{ ...value, unrelated: true }, false],
    ] as const) {
      assert.equal(
        runInContext(
          executable,
          createContext(
            { input },
            { codeGeneration: { strings: false, wasm: false } },
          ),
        ),
        expected,
      );
      if (!expected) assert.throws(() => shared(input));
    }
  }
});

for (const feature of ['products', 'sales'])
  test(`${feature} bundle contains approved pure Domain without Ajv/compiler or server/native infrastructure`, async () => {
    const output = await build({
      configFile: false,
      root: fileURLToPath(new URL('../', import.meta.url)),
      logLevel: 'silent',
      build: {
        write: false,
        minify: false,
        lib: {
          entry: fileURLToPath(
            new URL(`../src/${feature}/controller.ts`, import.meta.url),
          ),
          formats: ['es'],
          fileName: feature,
        },
      },
    });
    const results = Array.isArray(output) ? output : [output];
    let domain = false;
    let sourceTransport = false;
    for (const result of results) {
      assert.ok('output' in result);
      for (const chunk of result.output) {
        if (chunk.type !== 'chunk') continue;
        assert.doesNotMatch(chunk.code, /new Function|\beval\s*\(/);
        for (const module of Object.keys(chunk.modules)) {
          if (/packages[\\/]domain/.test(module)) domain = true;
          if (/packages[\\/]contracts[\\/]src[\\/]transport\.ts$/.test(module))
            sourceTransport = true;
          assert.doesNotMatch(
            module,
            /node_modules[\\/]ajv[\\/]|apps[\\/](api|mobile)|packages[\\/]application|expo|drizzle|pg[\\/]/,
          );
        }
      }
    }
    assert.equal(domain, true);
    assert.equal(sourceTransport, true);
  });

test('Vite bundles the reusable client without Ajv compiler, dynamic eval, API/server or mobile/domain modules', async () => {
  const output = await build({
    configFile: false,
    root: fileURLToPath(new URL('../', import.meta.url)),
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: {
        entry: fileURLToPath(new URL('../src/api/client.ts', import.meta.url)),
        formats: ['es'],
        fileName: 'client',
      },
    },
  });
  const results = Array.isArray(output) ? output : [output];
  for (const result of results) {
    assert.ok('output' in result);
    for (const chunk of result.output) {
      if (chunk.type !== 'chunk') continue;
      assert.doesNotMatch(chunk.code, /new Function|\beval\s*\(/);
      for (const module of Object.keys(chunk.modules))
        assert.doesNotMatch(
          module,
          /node_modules[\\/]ajv[\\/]|apps[\\/]api|apps[\\/]mobile|packages[\\/](domain|application)/,
        );
    }
  }
});
test('Purchase bundle tree-shakes Application root to pure pricing policy without use cases, repositories, API, Mobile or native modules', async () => {
  const output = await build({
    configFile: false,
    root: fileURLToPath(new URL('../', import.meta.url)),
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: {
        entry: fileURLToPath(
          new URL('../src/purchases/controller.ts', import.meta.url),
        ),
        formats: ['es'],
        fileName: 'purchases',
      },
    },
  });
  let pricing = false;
  for (const result of Array.isArray(output) ? output : [output]) {
    assert.ok('output' in result);
    for (const chunk of result.output) {
      if (chunk.type !== 'chunk') continue;
      assert.doesNotMatch(
        chunk.code,
        /new Function|\beval\s*\(|class RegisterPurchaseUseCase|class UpdateProductUseCase/,
      );
      for (const [module, info] of Object.entries(chunk.modules)) {
        if (!info.renderedLength) continue;
        if (/packages[\\/]application/.test(module)) {
          assert.match(module, /purchase-price-analysis\.ts$/);
          pricing = true;
        }
        assert.doesNotMatch(
          module,
          /node_modules[\\/]ajv[\\/]|apps[\\/](api|mobile)|expo|drizzle|pg[\\/]/,
        );
      }
    }
  }
  assert.equal(pricing, true);
});
