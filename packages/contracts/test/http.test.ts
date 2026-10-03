import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createApiError,
  type ApiErrorEnvelope,
  type LiveResponse,
} from '../src/index.js';

test('base envelopes always include code, public message and requestId', () => {
  const expected: ApiErrorEnvelope = {
    error: {
      code: 'NOT_FOUND',
      message: 'No encontrado.',
      requestId: 'request-1',
    },
  };
  assert.deepEqual(
    createApiError('NOT_FOUND', 'No encontrado.', 'request-1'),
    expected,
  );
  assert.deepEqual(JSON.parse(JSON.stringify(expected)), expected);
  assert.equal(Object.hasOwn(expected.error, 'fieldErrors'), false);
  assert.equal(Object.hasOwn(expected.error, 'details'), false);
});

test('optional fieldErrors and the liveness response have schema-derived types', () => {
  const error: ApiErrorEnvelope = {
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Revisa los datos.',
      requestId: 'request-2',
      fieldErrors: { name: ['Requerido.'] },
    },
  };
  const live: LiveResponse = { status: 'ok' };
  assert.deepEqual(error.error.fieldErrors, { name: ['Requerido.'] });
  assert.deepEqual(live, { status: 'ok' });
});
