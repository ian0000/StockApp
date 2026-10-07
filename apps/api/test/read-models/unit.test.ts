import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reportingDay } from '../../src/read-models/time.js';
import { createReadCursor } from '../../src/read-models/cursor.js';

for (const [zone, now, start, end] of [
  [
    'UTC',
    '2026-05-01T12:00:00Z',
    '2026-05-01T00:00:00Z',
    '2026-05-02T00:00:00Z',
  ],
  [
    'Pacific/Kiritimati',
    '2026-05-01T01:00:00Z',
    '2026-04-30T10:00:00Z',
    '2026-05-01T10:00:00Z',
  ],
  [
    'Asia/Kathmandu',
    '2026-05-01T01:00:00Z',
    '2026-04-30T18:15:00Z',
    '2026-05-01T18:15:00Z',
  ],
  [
    'America/Los_Angeles',
    '2026-05-01T20:00:00Z',
    '2026-05-01T07:00:00Z',
    '2026-05-02T07:00:00Z',
  ],
  [
    'America/New_York',
    '2026-03-08T12:00:00Z',
    '2026-03-08T05:00:00Z',
    '2026-03-09T04:00:00Z',
  ],
  [
    'America/New_York',
    '2026-11-01T12:00:00Z',
    '2026-11-01T04:00:00Z',
    '2026-11-02T05:00:00Z',
  ],
] as const)
  test(`reporting day uses IANA boundaries ${zone}/${now}`, () => {
    assert.deepEqual(reportingDay(Date.parse(now), zone), {
      fromInclusive: Date.parse(start),
      toExclusive: Date.parse(end),
    });
  });
test('invalid stored timezone and invalid clock fail closed', () => {
  assert.throws(() => reportingDay(1000, 'Invalid/Timezone'));
  assert.throws(() => reportingDay(-1, 'UTC'));
});
test('opaque authenticated cursor survives restart and binds dataset, route and normalized filter', () => {
  const codec = createReadCursor('fictional-api08-cursor-test-secret'),
    scope = {
      inventoryId: '550e8400-e29b-41d4-a716-446655440000',
      route: 'products',
      search: 'water',
    },
    key = { createdAt: 1000, id: '550e8400-e29b-41d4-a716-446655440001' };
  const token = codec.encode(scope, key);
  assert.deepEqual(
    createReadCursor('fictional-api08-cursor-test-secret').decode(token, scope),
    key,
  );
  assert.doesNotMatch(token, /water|products|550e8400/);
  for (const altered of [
    { ...scope, inventoryId: '550e8400-e29b-41d4-a716-446655440002' },
    { ...scope, search: 'milk' },
    { ...scope, route: 'stock-low' },
  ])
    assert.throws(() => codec.decode(token, altered), { statusCode: 400 });
  for (const invalid of [
    '?',
    token.slice(0, -5),
    token + '=',
    'x'.repeat(5000),
  ])
    assert.throws(() => codec.decode(invalid, scope), { statusCode: 400 });
  const bytes = Buffer.from(token, 'base64url');
  bytes[bytes.length - 1] ^= 1;
  assert.throws(() => codec.decode(bytes.toString('base64url'), scope), {
    statusCode: 400,
  });
  assert.throws(
    () => createReadCursor('different-fictional-secret').decode(token, scope),
    { statusCode: 400 },
  );
});
