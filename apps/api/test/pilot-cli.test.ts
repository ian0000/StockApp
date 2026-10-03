import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePilotArguments } from '../src/ownership/pilot-cli.js';

test('pilot CLI accepts explicit user ID plus one action and rejects ambiguous arguments', () => {
  assert.deepEqual(
    parsePilotArguments(['--', '--user-id', 'opaque-id', '--enable']),
    { userId: 'opaque-id', enabled: true },
  );
  assert.deepEqual(
    parsePilotArguments(['--user-id', 'opaque-id', '--disable']),
    { userId: 'opaque-id', enabled: false },
  );
  for (const args of [
    [],
    ['--user-id', 'opaque-id'],
    ['--email', 'private@example.test', '--enable'],
    ['--user-id', '', '--enable'],
    ['--user-id', 'id', '--enable', '--disable'],
    ['--user-id', '--enable', '--disable'],
  ])
    assert.throws(() => parsePilotArguments(args));
});
