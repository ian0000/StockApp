import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requireRecentAuthentication } from '../src/backup/recent-auth.js';
import { backupNumber } from '../src/backup/snapshot.js';
import { OwnershipError } from '../src/ownership/errors.js';

test('recent authentication includes the exact five-minute boundary and fails closed for invalid clocks', () => {
  const session = { session: { createdAt: new Date(1000) } };
  for (const age of [0, 299999, 300000])
    assert.doesNotThrow(() => requireRecentAuthentication(session, 1000 + age));
  assert.throws(
    () => requireRecentAuthentication(session, 301001),
    (error) =>
      error instanceof OwnershipError &&
      error.statusCode === 403 &&
      error.code === 'SESSION_NOT_FRESH',
  );
  for (const now of [999, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => requireRecentAuthentication(session, now));
  assert.throws(() =>
    requireRecentAuthentication(
      { session: { createdAt: new Date(NaN) } },
      1000,
    ),
  );
});

test('BackupV1 bigint conversion preserves signed safe boundaries and known zero without rounding', () => {
  for (const value of [-9007199254740991n, -1n, 0n, 1n, 9007199254740991n])
    assert.equal(BigInt(backupNumber(value)), value);
  for (const value of [-9007199254740992n, 9007199254740992n])
    assert.throws(() => backupNumber(value), RangeError);
});
