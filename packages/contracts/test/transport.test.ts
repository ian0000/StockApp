import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  decodeMoney,
  encodeMoney,
  decodeRevision,
  decodeTimestamp,
} from '../src/transport.js';

test('money transport preserves zero, signs, precision and safe integer boundaries', () => {
  for (const value of [
    0,
    1,
    -1,
    10666666,
    Number.MAX_SAFE_INTEGER,
    Number.MIN_SAFE_INTEGER,
  ]) {
    assert.equal(decodeMoney(encodeMoney(value)), value);
    assert.equal(encodeMoney(value), String(value));
  }
});

test('money rejects noncanonical strings, nonstrings and unsafe conversions', () => {
  for (const value of [
    '1.5',
    '1e6',
    '+100',
    '',
    '-0',
    '00',
    '01',
    '-01',
    ' 1',
    '1\n',
    '9007199254740992',
    '-9007199254740992',
    0,
    null,
    undefined,
    NaN,
    Infinity,
  ]) {
    assert.throws(() => decodeMoney(value), TypeError);
  }
  for (const value of [0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => encodeMoney(value), TypeError);
  }
  assert.equal(encodeMoney(-0), '0');
});

test('revisions stay canonical strings without lossy number conversion', () => {
  for (const value of ['0', '1', '9007199254740993']) {
    assert.equal(decodeRevision(value), value);
  }
  for (const value of [
    '01',
    '-1',
    '+1',
    '1.0',
    '1e3',
    '',
    '1\n',
    1,
    null,
    undefined,
  ]) {
    assert.throws(() => decodeRevision(value), TypeError);
  }
});

test('epoch milliseconds accept only safe nonnegative integers', () => {
  for (const value of [0, Date.UTC(2026, 9, 3), Number.MAX_SAFE_INTEGER]) {
    assert.equal(decodeTimestamp(value), value);
  }
  for (const value of [
    -1,
    0.1,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    '1',
    null,
    undefined,
  ]) {
    assert.throws(() => decodeTimestamp(value), TypeError);
  }
});

test('null and absence remain distinct and require explicit future nullable contracts', () => {
  assert.equal(JSON.stringify({ cost: null }), '{"cost":null}');
  assert.equal(JSON.stringify({ cost: undefined }), '{}');
  assert.throws(() => decodeMoney(null), TypeError);
  assert.throws(() => decodeMoney(undefined), TypeError);
});
