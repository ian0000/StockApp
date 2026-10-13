import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execute } from './run.mjs';

const temporary = mkdtempSync(join(tmpdir(), 'stockapp-ci-validators-'));
try {
  const generated = join(temporary, 'fresh');
  await execute([
    '--filter',
    '@stock-app/contracts',
    'exec',
    'tsx',
    'src/browser-error-cli.ts',
    generated,
  ]);
  const actual = resolve('apps/web/src/api/generated');
  const expectedFiles = readdirSync(generated).sort();
  assert.ok(expectedFiles.length > 0);
  assert.deepEqual(
    readdirSync(actual).sort(),
    expectedFiles,
    'Unexpected or missing generated browser validators',
  );
  for (const file of expectedFiles)
    assert.deepEqual(
      readFileSync(join(actual, file)),
      readFileSync(join(generated, file)),
      `Browser validator drift: ${file}`,
    );
  console.log(
    `Browser validator reproducibility PASS (${expectedFiles.length} files)`,
  );
} finally {
  if (
    dirname(temporary) !== resolve(tmpdir()) ||
    !temporary.startsWith(join(tmpdir(), 'stockapp-ci-validators-'))
  )
    throw new Error('Unsafe temporary cleanup target');
  rmSync(temporary, { recursive: true });
}
