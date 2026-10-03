import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createApiError,
  type ApiErrorEnvelope,
  type LiveResponse,
  apiErrorSchema,
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

test('ownership errors extend the envelope without removing foundation codes', () => {
  for (const code of apiErrorSchema.properties.error.properties.code.enum) {
    assert.equal(
      createApiError(code, 'Mensaje público.', 'request-3').error.code,
      code,
    );
  }
  assert.deepEqual(apiErrorSchema.properties.error.properties.code.enum, [
    'NOT_FOUND',
    'VALIDATION_ERROR',
    'INTERNAL_ERROR',
    'UNAUTHENTICATED',
    'EMAIL_NOT_VERIFIED',
    'CLOUD_ACCESS_DISABLED',
    'BUSINESS_ALREADY_EXISTS',
  ]);
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
