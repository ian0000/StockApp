import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { currentPlan } from './classify.mjs';
import { git, validSha } from './git.mjs';

const root = process.cwd();
const plan = currentPlan();
let changes = plan.changes;
if (!process.env.GITHUB_EVENT_NAME) {
  const base = process.env.CI_BASE_SHA || 'HEAD';
  assert.ok(base === 'HEAD' || validSha(base), 'Invalid local docs base');
  const paths = [
    ...git(['diff', '--name-only', '-z', base, '--']).split('\0'),
    ...git([
      'ls-files',
      '--others',
      '--exclude-standard',
      '-z',
      '--',
      '*.md',
    ]).split('\0'),
  ].filter(Boolean);
  changes = [{ paths: [...new Set(paths)] }];
}
// Check changed documents, not historical deliveries throughout the repository.
for (const change of changes || [])
  for (const path of change.paths) {
    if (!path.endsWith('.md') || !existsSync(path)) continue;
    const content = readFileSync(path, 'utf8');
    assert.ok(!/[\t ]+\r?$/m.test(content), `Trailing whitespace: ${path}`);
    let fenced = false;
    for (const line of content.split(/\r?\n/)) {
      if (/^\s*```/.test(line)) {
        fenced = !fenced;
        continue;
      }
      if (fenced) continue;
      for (const match of line.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
        const target = match[1]
          .replace(/^<|>$/g, '')
          .split(' ')[0]
          .split('#')[0];
        if (!target || /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(target)) continue;
        const file = resolve(dirname(path), decodeURIComponent(target));
        assert.ok(
          !relative(root, file).startsWith('..') && existsSync(file),
          `Missing local reference: ${path} -> ${target}`,
        );
      }
    }
    assert.equal(fenced, false, `Unclosed code fence: ${path}`);
    console.log(`Documentation references/whitespace/fences PASS: ${path}`);
  }
