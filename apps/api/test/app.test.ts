import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Writable } from 'node:stream';
import {
  apiErrorSchema,
  moneySchema,
  revisionSchema,
  timestampSchema,
  type ApiErrorEnvelope,
  type LiveResponse,
} from '@stock-app/contracts';
import { buildApp } from '../src/app.js';

test('GET /live returns minimal JSON and a server request ID without listening', async (t) => {
  const app = buildApp();
  t.after(() => app.close());
  assert.equal(app.server.listening, false);
  const response = await app.inject({
    method: 'GET',
    url: '/live',
    headers: { 'x-request-id': 'client-id', 'request-id': 'client-id' },
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-type'] ?? '', /application\/json/);
  assert.deepEqual(response.json<LiveResponse>(), { status: 'ok' });
  assert.ok(response.headers['x-request-id']);
  assert.notEqual(response.headers['x-request-id'], 'client-id');
  const next = await app.inject('/live');
  assert.notEqual(
    next.headers['x-request-id'],
    response.headers['x-request-id'],
  );
});

test('unknown and future routes use the 404 envelope with matching request ID', async (t) => {
  const app = buildApp();
  t.after(() => app.close());
  for (const url of [
    '/unknown',
    '/health',
    '/v1/products',
    '/api/auth',
    '/v1/sync',
    '/throw-error',
    '/test-validation',
  ]) {
    const response = await app.inject(url);
    assert.equal(response.statusCode, 404);
    assert.match(response.headers['content-type'] ?? '', /application\/json/);
    const body = response.json<ApiErrorEnvelope>();
    assert.deepEqual(body, {
      error: {
        code: 'NOT_FOUND',
        message: 'No encontramos esta ruta.',
        requestId: response.headers['x-request-id'],
      },
    });
  }
});

test('internal errors are sanitized, including errors with an untrusted statusCode', async (t) => {
  const app = buildApp();
  t.after(() => app.close());
  app.get('/private-test', async () => {
    throw Object.assign(new Error('SQL password=secret C:\\private\\file.ts'), {
      statusCode: 400,
    });
  });
  const response = await app.inject('/private-test');
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.json<ApiErrorEnvelope>(), {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'No pudimos completar la solicitud.',
      requestId: response.headers['x-request-id'],
    },
  });
  assert.doesNotMatch(response.body, /SQL|password|secret|private|stack/);
});

test('JSON Schema failures map to VALIDATION_ERROR using test-only routes', async (t) => {
  const app = buildApp();
  t.after(() => app.close());
  app.post('/private-test', { schema: { body: apiErrorSchema } }, async () => ({
    accepted: true,
  }));
  for (const payload of [
    {},
    { error: { code: 'NOT_FOUND', message: 'ok' } },
    { error: { code: 'NOT_FOUND', message: 'ok', requestId: '' } },
    { error: { code: 'OTHER', message: 'ok', requestId: '1' } },
    {
      error: {
        code: 'NOT_FOUND',
        message: 'ok',
        requestId: '1',
        stack: 'secret',
      },
    },
    {
      error: {
        code: 'NOT_FOUND',
        message: 'ok',
        requestId: '1',
        fieldErrors: null,
      },
    },
  ]) {
    const response = await app.inject({
      method: 'POST',
      url: '/private-test',
      payload,
    });
    assert.equal(response.statusCode, 400);
    const body = response.json<ApiErrorEnvelope>();
    assert.equal(body.error.code, 'VALIDATION_ERROR');
    assert.equal(body.error.requestId, response.headers['x-request-id']);
    assert.doesNotMatch(response.body, /secret|stack|schemaPath|instancePath/);
  }
  for (const error of [
    { code: 'NOT_FOUND', message: 'ok', requestId: '1' },
    {
      code: 'VALIDATION_ERROR',
      message: 'ok',
      requestId: '1',
      fieldErrors: { name: ['Required.'] },
    },
  ]) {
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/private-test',
          payload: { error },
        })
      ).statusCode,
      200,
    );
  }
  const malformed = await app.inject({
    method: 'POST',
    url: '/private-test',
    headers: { 'content-type': 'application/json' },
    payload: '{broken secret',
  });
  assert.equal(malformed.statusCode, 400);
  assert.equal(
    malformed.json<ApiErrorEnvelope>().error.code,
    'VALIDATION_ERROR',
  );
  assert.doesNotMatch(malformed.body, /broken|secret/);
});

test('application closes cleanly without opening a socket', async () => {
  const app = buildApp();
  await app.ready();
  await app.close();
  assert.equal(app.server.listening, false);
});

test('transport JSON Schemas reject noncanonical shapes without coercion', async (t) => {
  const app = buildApp();
  t.after(() => app.close());
  const cases = [
    {
      schema: moneySchema,
      valid: ['0', '-1', '10666666'],
      invalid: ['01', '-0', '1\n', '1e6', '1.5', 1, null],
    },
    {
      schema: revisionSchema,
      valid: ['0', '9007199254740993'],
      invalid: ['01', '-1', '1\n', 1, null],
    },
    {
      schema: timestampSchema,
      valid: [0, 1234],
      invalid: [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1234', null],
    },
  ];
  for (const [index, { schema }] of cases.entries()) {
    app.post(
      `/private-test-${index}`,
      {
        schema: {
          body: {
            type: 'object',
            properties: { value: schema },
            required: ['value'],
            additionalProperties: false,
          },
        },
      },
      async () => ({ accepted: true }),
    );
  }
  for (const [index, { valid, invalid }] of cases.entries()) {
    const url = `/private-test-${index}`;
    for (const value of valid)
      assert.equal(
        (await app.inject({ method: 'POST', url, payload: { value } }))
          .statusCode,
        200,
      );
    for (const value of invalid) {
      const response = await app.inject({
        method: 'POST',
        url,
        payload: { value },
      });
      assert.equal(response.statusCode, 400);
      assert.equal(
        response.json<ApiErrorEnvelope>().error.code,
        'VALIDATION_ERROR',
      );
    }
  }
});

test('logs omit URL queries, headers, bodies and raw errors', async (t) => {
  const entries: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      entries.push(String(chunk));
      callback();
    },
  });
  const app = buildApp({ logger: true, logStream: stream });
  t.after(() => app.close());
  app.post('/private-test', async () => {
    throw new Error('RAW_EXCEPTION_SECRET');
  });
  await app.inject({
    method: 'POST',
    url: '/private-test?token=QUERY_SECRET',
    headers: {
      authorization: 'Bearer HEADER_SECRET',
      cookie: 'token=COOKIE_SECRET',
    },
    payload: { password: 'BODY_SECRET' },
  });
  const logs = entries.join('');
  assert.ok(logs.includes('statusCode'));
  assert.doesNotMatch(
    logs,
    /QUERY_SECRET|HEADER_SECRET|COOKIE_SECRET|BODY_SECRET|RAW_EXCEPTION_SECRET/,
  );
});
