import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const assets = {
  'linux-x64': [
    'linux_amd64.tar.gz',
    '8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8',
  ],
  'win32-x64': [
    'windows_amd64.zip',
    '6e7241b51e6817ea6a047693d8e6fed13b31819c9a0dd6c5a726e1592d22f6e9',
  ],
};
const asset = assets[`${process.platform}-${process.arch}`];
assert.ok(
  asset,
  'Unsupported workflow lint platform; validation cannot be skipped',
);
const temporary = mkdtempSync(join(tmpdir(), 'stockapp-actionlint-'));
try {
  const filename = `actionlint_1.7.12_${asset[0]}`;
  const response = await fetch(
    `https://github.com/rhysd/actionlint/releases/download/v1.7.12/${filename}`,
  );
  assert.ok(response.ok, 'Cannot download pinned actionlint');
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    asset[1],
    'actionlint checksum mismatch',
  );
  const archive = join(temporary, filename);
  writeFileSync(archive, bytes);
  // tar on Windows supports ZIP; extract only the fixed executable, not archive paths.
  const binary = process.platform === 'win32' ? 'actionlint.exe' : 'actionlint';
  execFileSync('tar', ['-xf', archive, '-C', temporary, binary], {
    stdio: 'inherit',
  });
  execFileSync(join(temporary, binary), ['-color'], { stdio: 'inherit' });
  console.log(
    'All workflows: actionlint 1.7.12 PASS (pinned SHA-256 verified)',
  );
} finally {
  if (
    dirname(temporary) !== resolve(tmpdir()) ||
    !temporary.startsWith(join(tmpdir(), 'stockapp-actionlint-'))
  )
    throw new Error('Unsafe temporary cleanup target');
  rmSync(temporary, { recursive: true });
}
