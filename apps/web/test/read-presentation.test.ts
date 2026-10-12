import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  reportingDateKey,
  reportingDateLabel,
  historyGroups,
} from '../src/reads/presentation.js';
import { historyEntries, readNow } from './read-fixtures.js';

for (const [zone, timestamp, expected] of [
  ['America/Guayaquil', '2026-10-12T04:30:00Z', '2026-10-11'],
  ['Europe/Madrid', '2026-10-12T04:30:00Z', '2026-10-12'],
  ['Pacific/Kiritimati', '2026-10-11T11:00:00Z', '2026-10-12'],
  ['America/New_York', '2026-03-08T04:59:59Z', '2026-03-07'],
  ['America/New_York', '2026-03-08T05:00:00Z', '2026-03-08'],
  ['America/New_York', '2026-11-01T05:30:00Z', '2026-11-01'],
  ['America/New_York', '2026-11-01T06:30:00Z', '2026-11-01'],
] as const) {
  test(`calendar date uses reporting zone ${zone} at ${timestamp}`, () => {
    assert.equal(reportingDateKey(Date.parse(timestamp), zone), expected);
  });
}
for (const [timestamp, now, expected] of [
  ['2026-03-08T06:00:00Z', '2026-03-09T04:15:00Z', 'Ayer'],
  ['2026-11-01T05:30:00Z', '2026-11-02T05:15:00Z', 'Ayer'],
  ['2026-12-31T12:00:00Z', '2027-01-01T12:00:00Z', 'Ayer'],
  ['2026-10-12T04:30:00Z', '2026-10-12T22:30:00Z', 'Hoy'],
] as const) {
  test(`today/yesterday calendar labels across DST/year: ${timestamp}`, () => {
    assert.equal(
      reportingDateLabel(
        Date.parse(timestamp),
        'America/New_York',
        Date.parse(now),
      ),
      expected,
    );
  });
}
test('history groups preserve server ordering and group around local midnight rather than UTC midnight', () => {
  const entries = historyEntries.map((entry, i) => ({
    ...entry,
    effectiveAt: Date.parse(
      ['2026-10-12T05:01:00Z', '2026-10-12T04:59:00Z', '2026-10-11T23:59:00Z'][
        i
      ]!,
    ),
  }));
  const groups = historyGroups(
    entries,
    'America/Guayaquil',
    Date.parse('2026-10-12T15:00:00Z'),
  );
  assert.deepEqual(
    groups.map((g) => g.label),
    ['Hoy', 'Ayer'],
  );
  assert.deepEqual(
    groups.flatMap((g) => g.items),
    entries,
  );
  assert.equal(groups[1]!.items.length, 2);
});
test('grouping never sorts tied entries or mutates input', () => {
  const input = historyEntries.map((entry) => ({
    ...entry,
    effectiveAt: readNow,
  }));
  const snapshot = structuredClone(input);
  assert.deepEqual(
    historyGroups(input, 'Europe/Madrid', readNow)[0]!.items,
    input,
  );
  assert.deepEqual(input, snapshot);
});
test('older local dates are explicit Spanish dates', () => {
  assert.match(
    reportingDateLabel(
      Date.parse('2026-10-07T12:00:00Z'),
      'America/Guayaquil',
      readNow,
    ),
    /7.*octubre.*2026/,
  );
});
test('empty history has no fictional date group', () => {
  assert.deepEqual(historyGroups([], 'America/Guayaquil', readNow), []);
});
test('unrepresentable dates/timezones never fall back to the browser timezone or expose internals', () => {
  assert.equal(
    reportingDateLabel(Number.MAX_SAFE_INTEGER, 'America/Guayaquil', readNow),
    'Fecha no disponible',
  );
  assert.equal(
    reportingDateLabel(readNow, 'not-an-IANA-zone', readNow),
    'Fecha no disponible',
  );
});
