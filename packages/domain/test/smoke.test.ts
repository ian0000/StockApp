import assert from 'node:assert/strict';
import test from 'node:test';

function infrastructureProbe(value: string): string {
  return value;
}

test('runs TypeScript tests in the domain workspace', () => {
  assert.equal(infrastructureProbe('ready'), 'ready');
});
