import assert from 'node:assert/strict';
import { test } from 'node:test';
import { v7 } from 'uuid';
import { createApiClient, ApiClientError } from '../src/api/client.js';
import { createAccountClient } from '../src/account/client.js';
import { JsonDownloads } from '../src/account/download.js';
import {
  backup,
  accountExport,
  acceptedDeletion,
  inventoryId,
} from './account-fixtures.js';

for (const kind of ['BACKUP', 'EXPORT'] as const) {
  test(`${kind} uses explicit credentialed no-store GET with complete canonical JSON`, async () => {
    const expected = kind === 'BACKUP' ? backup() : accountExport();
    let count = 0;
    const api = createApiClient({
      baseUrl: 'https://api.example.test',
      fetcher: async (url, init) => {
        count++;
        assert.equal(
          new URL(String(url)).pathname,
          kind === 'BACKUP'
            ? `/v1/inventories/${inventoryId}/backup`
            : '/v1/me/export',
        );
        assert.equal(init?.method, 'GET');
        assert.equal(init?.credentials, 'include');
        assert.equal(init?.cache, 'no-store');
        assert.equal(init?.body, undefined);
        const headers = new Headers(init?.headers);
        assert.equal(headers.has('X-CSRF-Token'), false);
        assert.equal(headers.has('Idempotency-Key'), false);
        return Response.json(expected);
      },
    });
    const client = createAccountClient(api);
    assert.equal(count, 0);
    const actual =
      kind === 'BACKUP'
        ? await client.backup(inventoryId, new AbortController().signal)
        : await client.export(new AbortController().signal);
    assert.deepEqual(actual, expected);
    assert.equal(count, 1);
  });
  for (const bad of [
    null,
    {},
    { ...accountExport(), extra: 'PII' },
    { ...backup(), formatVersion: 2 },
  ])
    test(`${kind} rejects malformed DTO ${JSON.stringify(bad).slice(0, 45)}`, async () => {
      const client = createAccountClient(
        createApiClient({
          baseUrl: 'https://api.example.test',
          fetcher: async () => Response.json(bad),
        }),
      );
      await assert.rejects(
        kind === 'BACKUP'
          ? client.backup(inventoryId, new AbortController().signal)
          : client.export(new AbortController().signal),
        ApiClientError,
      );
    });
}
test('AccountExport preserves user and backup=null without inventing dataset', async () => {
  const client = createAccountClient(
    createApiClient({
      baseUrl: 'https://api.example.test',
      fetcher: async () => Response.json(accountExport(false)),
    }),
  );
  assert.deepEqual(
    await client.export(new AbortController().signal),
    accountExport(false),
  );
});
test('deletion obtains CSRF then exact empty body UUIDv7 key; no receipt/ChangeSet', async () => {
  const calls: string[] = [],
    key = v7();
  const client = createAccountClient(
    createApiClient({
      baseUrl: 'https://api.example.test',
      fetcher: async (url, init) => {
        const path = new URL(String(url)).pathname;
        calls.push(path);
        if (path === '/v1/session/csrf')
          return Response.json({ token: 'csrf-fixture' });
        assert.equal(path, '/v1/me/deletion');
        assert.equal(init?.method, 'POST');
        assert.equal(init?.body, '{}');
        assert.equal(new Headers(init?.headers).get('Idempotency-Key'), key);
        assert.equal(
          new Headers(init?.headers).get('X-CSRF-Token'),
          'csrf-fixture',
        );
        return Response.json(acceptedDeletion, { status: 202 });
      },
    }),
  );
  const actual = await client.deletion(key, new AbortController().signal, () =>
    calls.push('sent'),
  );
  assert.deepEqual(actual, acceptedDeletion);
  assert.deepEqual(calls, ['/v1/session/csrf', 'sent', '/v1/me/deletion']);
});
for (const [status, body] of [
  [200, acceptedDeletion],
  [202, {}],
  [202, { ...acceptedDeletion, sessionsRevoked: false }],
  [202, { ...acceptedDeletion, progress: 100 }],
] as const)
  test(`deletion rejects ${status}/${JSON.stringify(body)}`, async () => {
    const client = createAccountClient(
      createApiClient({
        baseUrl: 'https://api.example.test',
        fetcher: async (url) =>
          new URL(String(url)).pathname.endsWith('csrf')
            ? Response.json({ token: 'c' })
            : Response.json(body, { status }),
      }),
    );
    await assert.rejects(
      client.deletion(v7(), new AbortController().signal, () => {}),
      ApiClientError,
    );
  });
test('failed CSRF never sends deletion; invalid key never accesses API', async () => {
  let calls = 0,
    sent = 0;
  const client = createAccountClient(
    createApiClient({
      baseUrl: 'https://api.example.test',
      fetcher: async () => {
        calls++;
        return Response.json({});
      },
    }),
  );
  await assert.rejects(
    client.deletion('invalid', new AbortController().signal, () => sent++),
  );
  assert.equal(calls, 0);
  await assert.rejects(
    client.deletion(v7(), new AbortController().signal, () => sent++),
  );
  assert.equal(calls, 1);
  assert.equal(sent, 0);
});
for (const filename of [
  'stockapp-backup.json',
  'stockapp-account-export.json',
] as const)
  test(`download ${filename} retains exact financial snapshots and cleans temporary URL`, async () => {
    let file: Blob | undefined;
    const revoked: string[] = [];
    let cleanup: (() => void) | undefined;
    const downloads = new JsonDownloads({
      create(blob) {
        file = blob;
        return 'blob:test';
      },
      revoke(url) {
        revoked.push(url);
      },
      handoff(url, name) {
        assert.equal(url, 'blob:test');
        assert.equal(name, filename);
      },
      schedule(fn) {
        cleanup = fn;
      },
    });
    const expected =
      filename === 'stockapp-backup.json' ? backup() : accountExport();
    downloads.save(expected, filename);
    assert.ok(file);
    assert.equal(file.type, 'application/json');
    assert.equal(await file.text(), JSON.stringify(expected, null, 2) + '\n');
    assert.ok((await file.text()).includes('1000001'));
    assert.ok((await file.text()).includes('VOIDED'));
    assert.deepEqual(revoked, []);
    cleanup?.();
    downloads.clear();
    assert.deepEqual(revoked, ['blob:test']);
  });
test('handoff cancellation/failure releases URL and propagates sanitized recoverable failure', () => {
  let revoked = 0;
  const downloads = new JsonDownloads({
    create: () => 'blob:test',
    revoke: () => {
      revoked++;
    },
    handoff: () => {
      throw new Error('download cancelled');
    },
    schedule: () => {},
  });
  assert.throws(() => downloads.save(backup(), 'stockapp-backup.json'));
  assert.equal(revoked, 1);
});
test('session boundary cleanup revokes all live URLs exactly once', () => {
  const revoked: string[] = [],
    cleanup: (() => void)[] = [];
  let n = 0;
  const downloads = new JsonDownloads({
    create: () => `blob:${n++}`,
    revoke: (url) => {
      revoked.push(url);
    },
    handoff: () => {},
    schedule: (fn) => {
      cleanup.push(fn);
    },
  });
  downloads.save(backup(), 'stockapp-backup.json');
  downloads.save(accountExport(), 'stockapp-account-export.json');
  downloads.clear();
  cleanup.forEach((fn) => fn());
  assert.deepEqual(revoked, ['blob:0', 'blob:1']);
});

test('large complete export is never truncated or subjected to a fabricated size limit', async () => {
  const data = accountExport();
  assert.ok(data.backup);
  const product = data.backup.data.products[0]!;
  data.backup.data.products = Array.from({ length: 1501 }, (_, index) => ({
    ...product,
    id: `product-${index}`,
  }));
  let file: Blob | undefined;
  const downloads = new JsonDownloads({
    create: (blob) => {
      file = blob;
      return 'blob:large';
    },
    revoke: () => {},
    handoff: () => {},
    schedule: (fn) => fn(),
  });
  const client = createAccountClient(
    createApiClient({
      baseUrl: 'https://api.example.test',
      fetcher: async () => Response.json(data),
    }),
  );
  const exported = await client.export(new AbortController().signal);
  downloads.save(exported, 'stockapp-account-export.json');
  assert.deepEqual(exported, data);
  assert.equal(exported.backup?.data.products.length, 1501);
  assert.ok(file);
  assert.equal(await file.text(), JSON.stringify(data, null, 2) + '\n');
});
