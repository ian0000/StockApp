import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  Clock,
  InventoryMovementIdGenerator,
  ProductIdGenerator,
  PurchaseIdGenerator,
} from '@stock-app/application';
import { parse, validate, version } from 'uuid';

import type { UuidV7Generator } from '../src/infrastructure/identity/uuid-v7-generator';
import { generateUuidV7 } from '../src/infrastructure/identity/uuid-v7';
import { SystemClock } from '../src/infrastructure/time/system-clock';

const UUID_TIMESTAMP = 1_776_444_000_000;

class FakeClock implements Clock {
  calls = 0;

  constructor(private readonly timestamp: number) {}

  now(): number {
    this.calls += 1;
    return this.timestamp;
  }
}

function randomBytes(fill: number): Uint8Array {
  return new Uint8Array(16).fill(fill);
}

function readUuidTimestamp(uuid: string): number {
  return parse(uuid)
    .slice(0, 6)
    .reduce((timestamp, byte) => timestamp * 256 + byte, 0);
}

test('SystemClock returns a number', () => {
  assert.equal(typeof new SystemClock().now(), 'number');
});

test('SystemClock returns a safe integer', () => {
  assert.equal(Number.isSafeInteger(new SystemClock().now()), true);
});

test('SystemClock returns a non-negative timestamp', () => {
  assert.ok(new SystemClock().now() >= 0);
});

test('SystemClock returns current Unix epoch milliseconds', () => {
  const before = Date.now();
  const timestamp = new SystemClock().now();
  const after = Date.now();

  assert.ok(timestamp >= before);
  assert.ok(timestamp <= after);
});

test('UUID generator produces a valid RFC UUID', () => {
  const uuid = generateUuidV7(new FakeClock(UUID_TIMESTAMP), randomBytes(1));

  assert.equal(validate(uuid), true);
});

test('UUID generator produces version 7 UUIDs', () => {
  const uuid = generateUuidV7(new FakeClock(UUID_TIMESTAMP), randomBytes(2));

  assert.equal(version(uuid), 7);
});

test('UUID generator uses the supplied Clock timestamp', () => {
  const clock = new FakeClock(UUID_TIMESTAMP);
  const uuid = generateUuidV7(clock, randomBytes(3));

  assert.equal(clock.calls, 1);
  assert.equal(readUuidTimestamp(uuid), UUID_TIMESTAMP);
});

test('UUID generator produces distinct IDs at the same timestamp', () => {
  const clock = new FakeClock(UUID_TIMESTAMP);

  const first = generateUuidV7(clock, randomBytes(4));
  const second = generateUuidV7(clock, randomBytes(5));

  assert.notEqual(first, second);
});

test('UUID generator reflects increasing Clock timestamps', () => {
  const earlier = generateUuidV7(new FakeClock(UUID_TIMESTAMP), randomBytes(6));
  const later = generateUuidV7(
    new FakeClock(UUID_TIMESTAMP + 1),
    randomBytes(6),
  );

  assert.ok(earlier < later);
});

test('UuidV7Generator satisfies ProductIdGenerator structurally', () => {
  type IsCompatible = UuidV7Generator extends ProductIdGenerator ? true : false;
  const isCompatible: IsCompatible = true;

  assert.equal(isCompatible, true);
});

test('UuidV7Generator satisfies InventoryMovementIdGenerator structurally', () => {
  type IsCompatible = UuidV7Generator extends InventoryMovementIdGenerator
    ? true
    : false;
  const isCompatible: IsCompatible = true;

  assert.equal(isCompatible, true);
});

test('UuidV7Generator satisfies PurchaseIdGenerator structurally', () => {
  type IsCompatible = UuidV7Generator extends PurchaseIdGenerator
    ? true
    : false;
  const isCompatible: IsCompatible = true;

  assert.equal(isCompatible, true);
});
