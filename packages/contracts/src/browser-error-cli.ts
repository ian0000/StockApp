import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import standaloneModule from 'ajv/dist/standalone/index.js';
import ucs2lengthModule from 'ajv/dist/runtime/ucs2length.js';
import { apiErrorSchema } from './http.js';

// Build-only: the browser receives a static validator, never the Ajv compiler.
const output = process.argv[2];
if (process.argv.length !== 3 || !output)
  throw new Error('Provide the generated client directory.');
const compiler = new Ajv2020({
  strict: true,
  coerceTypes: false,
  removeAdditional: false,
  useDefaults: false,
  code: { source: true, esm: true, lines: true },
});
const validate = compiler.compile(apiErrorSchema);
// Ajv emits this runtime helper as a CJS require even for standalone ESM.
// Inline its existing pure implementation; the client needs neither require nor Ajv.
const browserCode = standaloneModule
  .default(compiler, validate)
  .replaceAll(
    'require("ajv/dist/runtime/ucs2length").default',
    `(${ucs2lengthModule.default.toString()})`,
  );
if (/\brequire\s*\(/.test(browserCode))
  throw new Error('Unexpected standalone runtime dependency.');
await mkdir(resolve(output), { recursive: true });
await writeFile(
  resolve(output, 'api-error.mjs'),
  '// Generated from @stock-app/contracts ApiError. Do not edit.\n' +
    browserCode,
);
await writeFile(
  resolve(output, 'api-error.d.mts'),
  'import type { ApiErrorEnvelope } from "@stock-app/contracts";\n' +
    'export default function validate(input: unknown): input is ApiErrorEnvelope;\n',
);
