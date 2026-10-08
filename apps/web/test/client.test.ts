import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApiError } from '@stock-app/contracts';
import { ApiClientError, createApiClient } from '../src/api/client.js';
import { readApiConfig } from '../src/api/config.js';

test('public API config is explicit, rejects missing/unsafe origins and has no production fallback', () => {
  for (const value of [
    undefined,
    '',
    'invalid',
    'javascript:alert(1)',
    'https://user:password@example.test',
    'https://example.test?secret=private',
    'https://example.test/#fragment',
    'https://example.test/v1',
  ])
    assert.throws(() => readApiConfig({ VITE_API_URL: value }));
  assert.deepEqual(readApiConfig({ VITE_API_URL: 'http://127.0.0.1:3001/' }), {
    apiUrl: 'http://127.0.0.1:3001',
  });
});

test('native fetch includes cookies and JSON headers, forwards cancellation and preserves exact transport strings', async () => {
  const body = {
    price: '9007199254740991',
    revision: '9223372036854775807',
    unknownCost: null,
    zeroCost: '0',
  };
  const abort = new AbortController();
  let calls = 0;
  const client = createApiClient({
    baseUrl: 'https://api.example.test',
    fetcher: async (url, options) => {
      calls++;
      assert.equal(String(url), 'https://api.example.test/v1/me');
      assert.equal(options?.credentials, 'include');
      assert.equal(options?.redirect, 'error');
      assert.equal(options?.cache, 'no-store');
      assert.equal(options?.signal, abort.signal);
      const headers = new Headers(options?.headers);
      assert.equal(headers.get('accept'), 'application/json');
      assert.equal(headers.get('authorization'), null);
      return Response.json(body, { headers: { 'x-request-id': 'fixture' } });
    },
  });
  const result = await client.request('/v1/me', { signal: abort.signal });
  assert.equal(calls, 1);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, body);
  assert.equal(result.headers.get('x-request-id'), 'fixture');
});

test('JSON request serialization keeps Money/Revision strings and uses supplied headers without inventing credentials', async () => {
  const body = { amount: '1234567', revision: '9223372036854775807' };
  const client = createApiClient({
    baseUrl: 'http://127.0.0.1:3001',
    fetcher: async (_url, options) => {
      assert.equal(options?.method, 'POST');
      assert.equal(options?.body, JSON.stringify(body));
      const headers = new Headers(options?.headers);
      assert.equal(headers.get('content-type'), 'application/json');
      assert.equal(headers.get('x-request-id'), 'fixture');
      return new Response(null, { status: 204 });
    },
  });
  assert.deepEqual(
    (
      await client.request('/v1/me/deletion', {
        method: 'POST',
        body,
        headers: { 'x-request-id': 'fixture' },
      })
    ).body,
    null,
  );
});

test('ApiError V1 keeps HTTP status/requestId/details/retry header and never exposes raw invalid errors', async () => {
  const envelope = {
    ...createApiError('REVISION_CONFLICT', 'Cambió la revisión.', 'request-1'),
  };
  const conflict = {
    error: {
      ...envelope.error,
      details: { currentRevision: '9223372036854775807' },
    },
  };
  for (const status of [401, 403, 409, 422, 429, 500]) {
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      fetcher: async () =>
        Response.json(conflict, { status, headers: { 'retry-after': '12' } }),
    });
    await assert.rejects(client.request('/v1/me'), (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.kind, 'HTTP');
      assert.equal(error.status, status);
      assert.deepEqual(error.apiError, conflict);
      assert.equal(error.headers.get('retry-after'), '12');
      return true;
    });
  }
  for (const invalid of [
    { error: { code: 'INVENTED', message: 'raw private', requestId: 'r' } },
    { ...conflict, stack: 'raw private' },
    { error: { ...conflict.error, details: { currentRevision: 5 } } },
  ]) {
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      fetcher: async () => Response.json(invalid, { status: 409 }),
    });
    await assert.rejects(client.request('/v1/me'), (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.status, 409);
      assert.equal(error.apiError, null);
      assert.doesNotMatch(error.message, /raw private|INVENTED/);
      return true;
    });
  }
});

test('malformed JSON/non-JSON keep status; network failure is distinct and has no retries', async () => {
  for (const status of [200, 502]) {
    for (const media of ['application/json', 'text/html']) {
      const client = createApiClient({
        baseUrl: 'https://api.example.test',
        fetcher: async () =>
          new Response('raw invalid private', {
            status,
            headers: { 'content-type': media },
          }),
      });
      await assert.rejects(client.request('/v1/me'), (error: unknown) => {
        assert.ok(error instanceof ApiClientError);
        assert.equal(error.status, status);
        assert.equal(error.kind, status === 200 ? 'INVALID_JSON' : 'HTTP');
        assert.equal(error.apiError, null);
        assert.doesNotMatch(error.message, /raw invalid private/);
        return true;
      });
    }
  }
  let calls = 0;
  const client = createApiClient({
    baseUrl: 'https://api.example.test',
    fetcher: async () => {
      calls++;
      throw new Error('private network details');
    },
  });
  await assert.rejects(client.request('/v1/me'), {
    kind: 'NETWORK',
    status: null,
  });
  assert.equal(calls, 1);
});

test('credentialed requests cannot escape configured origin or silently follow redirects', async () => {
  let calls = 0;
  const client = createApiClient({
    baseUrl: 'https://api.example.test',
    fetcher: async () => {
      calls++;
      return Response.json({});
    },
  });
  for (const path of [
    'https://foreign.test',
    '//foreign.test',
    '/\\foreign.test',
    '/v1/me#fragment',
  ])
    await assert.rejects(client.request(path), TypeError);
  assert.equal(calls, 0);
});

test('non-serializable JSON fails before fetch and is not misreported as a network failure', async () => {
  let calls = 0;
  const client = createApiClient({
    baseUrl: 'https://api.example.test',
    fetcher: async () => {
      calls++;
      return Response.json({});
    },
  });
  await assert.rejects(
    client.request('/v1/me', { method: 'POST', body: { revision: 1n } }),
    {
      kind: 'INVALID_JSON',
      status: null,
    },
  );
  assert.equal(calls, 0);
});
