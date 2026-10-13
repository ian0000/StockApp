import test from 'node:test';
import assert from 'node:assert/strict';
import { durationSeconds } from './timings.mjs';

test('measured timestamp interval preserved for executed jobs/steps', () => {
  assert.equal(
    durationSeconds('2026-10-13T02:36:07Z', '2026-10-13T02:36:22Z', 'success'),
    15,
  );
  assert.equal(
    durationSeconds('2026-10-13T02:36:07Z', '2026-10-13T02:36:22Z', 'failure'),
    15,
  );
});
test('GitHub skipped jobs with end before start have no execution duration', () => {
  assert.equal(
    durationSeconds('2026-10-13T02:36:23Z', '2026-10-13T02:36:22Z', 'skipped'),
    null,
  );
  assert.equal(
    durationSeconds('2026-10-13T02:36:23Z', '2026-10-13T02:36:22Z'),
    null,
  );
  assert.equal(
    durationSeconds('2026-10-13T02:36:07Z', '2026-10-13T02:36:22Z', 'skipped'),
    null,
  );
});
test('missing/invalid timestamps remain unavailable, never invented zero', () => {
  for (const value of ['', undefined, 'invalid'])
    assert.equal(durationSeconds(value, '2026-10-13T02:36:22Z'), null);
  assert.equal(durationSeconds('2026-10-13T02:36:22Z', ''), null);
});
test('an executed stage rounded to identical API timestamps measures zero', () => {
  assert.equal(
    durationSeconds('2026-10-13T02:36:22Z', '2026-10-13T02:36:22Z', 'success'),
    0,
  );
});
