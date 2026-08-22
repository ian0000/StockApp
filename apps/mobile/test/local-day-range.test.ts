import assert from 'node:assert/strict';
import test from 'node:test';

import { getLocalDayRange } from '../src/ui/home/local-day-range';

test('uses the local calendar day containing the supplied instant', () => {
  const instant = new Date(2026, 4, 17, 13, 45, 20, 123);

  const range = getLocalDayRange(instant);

  assert.equal(range.fromInclusive, new Date(2026, 4, 17).getTime());
  assert.equal(range.toExclusive, new Date(2026, 4, 18).getTime());
});

test('returns exact local midnight boundaries from an epoch value', () => {
  const instant = new Date(2026, 7, 21, 9, 30).getTime();
  const range = getLocalDayRange(instant);

  const from = new Date(range.fromInclusive);
  const to = new Date(range.toExclusive);

  assert.deepEqual(
    [
      from.getHours(),
      from.getMinutes(),
      from.getSeconds(),
      from.getMilliseconds(),
    ],
    [0, 0, 0, 0],
  );
  assert.deepEqual(
    [to.getHours(), to.getMinutes(), to.getSeconds(), to.getMilliseconds()],
    [0, 0, 0, 0],
  );
  assert.ok(range.fromInclusive < range.toExclusive);
});

test('crosses a month boundary using the next local midnight', () => {
  const range = getLocalDayRange(new Date(2026, 3, 30, 23, 59));

  assert.equal(range.fromInclusive, new Date(2026, 3, 30).getTime());
  assert.equal(range.toExclusive, new Date(2026, 4, 1).getTime());
});

test('crosses a year boundary using the next local midnight', () => {
  const range = getLocalDayRange(new Date(2026, 11, 31, 12));

  assert.equal(range.fromInclusive, new Date(2026, 11, 31).getTime());
  assert.equal(range.toExclusive, new Date(2027, 0, 1).getTime());
});

test('rejects an invalid date', () => {
  assert.throws(() => getLocalDayRange(Number.NaN), /valid date/);
});
