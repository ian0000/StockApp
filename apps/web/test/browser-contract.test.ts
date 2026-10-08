import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { build } from 'vite';
import { apiErrorSchema, createSchemaValidator } from '@stock-app/contracts';
import validateBrowserError from '../src/api/generated/api-error.mjs';

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
