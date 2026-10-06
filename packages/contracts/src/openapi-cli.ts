import { readFile, writeFile } from 'node:fs/promises';
import { assertOpenApiCurrent, serializeOpenApi } from './openapi.js';

const target = new URL(
  '../../../docs/web/openapi/stockapp-v1.json',
  import.meta.url,
);
const generated = serializeOpenApi();
if (process.argv.includes('--check')) {
  const current = await readFile(target, 'utf8');
  assertOpenApiCurrent(current);
  process.stdout.write('OpenAPI matches the canonical contracts.\n');
} else {
  await writeFile(target, generated, 'utf8');
  process.stdout.write('OpenAPI generated from canonical contracts.\n');
}
