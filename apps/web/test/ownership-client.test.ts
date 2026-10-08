import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  bootstrapRequestSchema,
  bootstrapResponseSchema,
  csrfResponseSchema,
  meResponseSchema,
  createSchemaValidator,
} from '@stock-app/contracts';
import { createApiClient, ApiClientError } from '../src/api/client.js';
import {
  createOwnershipClient,
  suggestedTimeZone,
} from '../src/api/ownership.js';
import validateMe from '../src/api/generated/me.mjs';
import validateCsrf from '../src/api/generated/csrf.mjs';
import validateBootstrap from '../src/api/generated/bootstrap-response.mjs';
import validateInput from '../src/api/generated/bootstrap-request.mjs';
import { me } from './session-fixtures.js';

const input = {
  inventoryName: 'Real',
  currency: 'EUR',
  reportingTimeZone: 'Europe/Madrid',
};
const bootstrap = { business: me.business, inventory: me.inventory };
test('bootstrap fetches CSRF first and sends exact three fields/cookie/JSON with 201 or matching 200', async () => {
  for (const status of [201, 200]) {
    const paths: string[] = [];
    const signal = new AbortController().signal;
    const owner = createOwnershipClient(
      createApiClient({
        baseUrl: 'https://api.example.test',
        fetcher: async (url, init) => {
          const path = new URL(String(url)).pathname;
          paths.push(path);
          assert.equal(init?.credentials, 'include');
          assert.equal(init?.signal, signal);
          if (path.endsWith('/csrf')) {
            assert.equal(init?.method, 'GET');
            return Response.json({ token: 'csrf-fixture' });
          }
          assert.equal(init?.method, 'POST');
          assert.equal(
            new Headers(init?.headers).get('x-csrf-token'),
            'csrf-fixture',
          );
          assert.equal(
            new Headers(init?.headers).get('content-type'),
            'application/json',
          );
          assert.deepEqual(JSON.parse(String(init?.body)), input);
          return Response.json(bootstrap, { status });
        },
      }),
    );
    assert.deepEqual(await owner.bootstrap(input, signal), bootstrap);
    assert.deepEqual(paths, ['/v1/session/csrf', '/v1/business']);
  }
});
test('browser validators agree with shared Me/Csrf/Bootstrap schemas including nullable metadata and strict extra rejection', () => {
  const cases = [
    [meResponseSchema, validateMe, me],
    [meResponseSchema, validateMe, { ...me, business: null, inventory: null }],
    [csrfResponseSchema, validateCsrf, { token: 't' }],
    [bootstrapResponseSchema, validateBootstrap, bootstrap],
    [bootstrapRequestSchema, validateInput, input],
  ] as const;
  for (const [schema, validator, value] of cases) {
    const shared = createSchemaValidator(schema);
    assert.doesNotThrow(() => shared(value));
    assert.equal(validator(value), true);
    const malformed = { ...value, injected: 'private' };
    assert.throws(() => shared(malformed));
    assert.equal(validator(malformed), false);
    assert.throws(() => shared({}));
    assert.equal(validator({}), false);
  }
});
test('malformed Me/Csrf/bootstrap success fails safely and never POSTs after invalid csrf', async () => {
  for (const malformed of ['me', 'csrf', 'bootstrap']) {
    let posts = 0;
    const owner = createOwnershipClient(
      createApiClient({
        baseUrl: 'https://api.example.test',
        fetcher: async (url, init) => {
          const path = new URL(String(url)).pathname;
          if (init?.method === 'POST') {
            posts++;
            return Response.json({ internal: 'PRIVATE' });
          }
          return Response.json(
            path.endsWith('/csrf') && malformed !== 'csrf'
              ? { token: 't' }
              : { internal: 'PRIVATE' },
          );
        },
      }),
    );
    await assert.rejects(
      malformed === 'me'
        ? owner.me(new AbortController().signal)
        : owner.bootstrap(input, new AbortController().signal),
      (error: unknown) =>
        error instanceof ApiClientError &&
        error.kind === 'INVALID_JSON' &&
        !error.message.includes('PRIVATE'),
    );
    assert.equal(posts, malformed === 'bootstrap' ? 1 : 0);
  }
});
test('invalid currency/input fails before any network without silently defaulting or adding bootstrap fields', async () => {
  let calls = 0;
  const owner = createOwnershipClient(
    createApiClient({
      baseUrl: 'https://api.example.test',
      fetcher: async () => {
        calls++;
        return Response.json(bootstrap);
      },
    }),
  );
  await assert.rejects(
    owner.bootstrap({ ...input, currency: '' }, new AbortController().signal),
  );
  assert.equal(calls, 0);
  assert.equal(validateInput({ ...input, cloudAccessEnabled: true }), false);
  assert.equal(validateInput({ ...input, businessName: 'Fake' }), false);
});
test('timezone suggestion uses only browser result; no universal default', () => {
  assert.equal(
    suggestedTimeZone(() => 'Europe/Madrid'),
    'Europe/Madrid',
  );
  assert.equal(
    suggestedTimeZone(() => ''),
    '',
  );
  assert.equal(
    suggestedTimeZone(() => 'Invalid/Zone'),
    '',
  );
  assert.equal(
    suggestedTimeZone(() => '+01:00'),
    '',
  );
  assert.equal(
    suggestedTimeZone(() => {
      throw new Error('Unsupported');
    }),
    '',
  );
});
