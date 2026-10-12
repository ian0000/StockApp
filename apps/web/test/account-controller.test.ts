import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MeResponse } from '@stock-app/contracts';
import {
  AccountController,
  deletionUnknown,
  deletionAccepted,
  accountError,
} from '../src/account/controller.js';
import type { AccountClient } from '../src/account/client.js';
import { JsonDownloads } from '../src/account/download.js';
import { ApiClientError } from '../src/api/client.js';
import { fixture, me, identity, deferred } from './session-fixtures.js';
import { backup, accountExport, acceptedDeletion } from './account-fixtures.js';
const failure = (status: number, code = 'INTERNAL_ERROR') =>
  new ApiClientError('HTTP', status, {
    error: {
      code:
        code === 'SESSION_NOT_FRESH'
          ? 'SESSION_NOT_FRESH'
          : code === 'CLOUD_ACCESS_DISABLED'
            ? 'CLOUD_ACCESS_DISABLED'
            : 'INTERNAL_ERROR',
      message: 'raw-fixture-canary',
      requestId: 'r1',
    },
  });
function setup(
  changes: Partial<AccountClient> = {},
  metadata: MeResponse = structuredClone(me),
) {
  let meta = metadata,
    activeIdentity = { ...identity },
    loginCalls = 0,
    downloads = 0,
    backupCalls = 0,
    exportCalls = 0,
    online = true;
  const keys: string[] = [];
  const f = fixture(
    {
      session: async () => activeIdentity,
      login: async () => {
        loginCalls++;
        activeIdentity = { ...activeIdentity, sessionId: 'new-session' };
      },
    },
    { me: async () => structuredClone(meta) },
  );
  const client: AccountClient = {
    backup: async () => {
      backupCalls++;
      return backup();
    },
    export: async () => {
      exportCalls++;
      return accountExport(Boolean(meta.inventory));
    },
    deletion: async (key, _signal, sent) => {
      sent();
      keys.push(key);
      return acceptedDeletion;
    },
    ...changes,
  };
  const controller = new AccountController(
    client,
    f.controller,
    new JsonDownloads({
      create: () => 'blob:test',
      revoke: () => {},
      handoff: () => {
        downloads++;
      },
      schedule: (fn) => fn(),
    }),
    () => online,
  );
  return {
    ...f,
    account: controller,
    keys,
    change(metaNext: MeResponse) {
      meta = metaNext;
      activeIdentity = { ...activeIdentity, userId: meta.user.id };
    },
    offline() {
      online = false;
    },
    stats: () => ({ loginCalls, downloads, backupCalls, exportCalls }),
    close() {
      controller.dispose();
      f.controller.dispose();
      f.queries.clear();
    },
  };
}
for (const variant of [
  'enabled',
  'disabled',
  'no-business',
  'no-inventory',
  'deleting',
] as const) {
  test(`account actions ${variant} stay independent of commerce`, async (t) => {
    const meta = structuredClone(me);
    if (variant === 'disabled') meta.business!.cloudAccessEnabled = false;
    if (variant === 'no-business') {
      meta.business = null;
      meta.inventory = null;
    }
    if (variant === 'no-inventory') meta.inventory = null;
    if (variant === 'deleting') {
      meta.business!.status = 'DELETING';
      meta.business!.cloudAccessEnabled = false;
    }
    const h = setup({}, meta);
    t.after(h.close);
    await h.controller.refresh();
    assert.deepEqual(h.stats(), {
      loginCalls: 0,
      downloads: 0,
      backupCalls: 0,
      exportCalls: 0,
    });
    await h.account.download('BACKUP');
    assert.equal(h.stats().backupCalls, variant === 'enabled' ? 1 : 0);
    await h.account.download('EXPORT');
    assert.equal(h.stats().exportCalls, variant === 'deleting' ? 0 : 1);
    h.account.reviewDeletion();
    assert.equal(h.account.snapshot().kind, 'REVIEW');
    h.account.cancel();
    assert.equal(h.keys.length, 0);
    h.account.reviewDeletion();
    await h.account.confirmDeletion();
    assert.equal(h.keys.length, 1);
    assert.equal(h.account.snapshot().message, deletionAccepted);
    assert.equal(h.controller.snapshot().kind, 'ANONYMOUS');
  });
}
test('anonymous and unverified cannot download/confirm/delete', async (t) => {
  const h = setup({}, { ...me, user: { ...me.user, emailVerified: false } });
  t.after(h.close);
  await h.account.download('EXPORT');
  h.account.reviewDeletion();
  await h.account.confirmDeletion();
  assert.equal(h.stats().exportCalls, 0);
  assert.equal(h.keys.length, 0);
  await h.controller.refresh();
  await h.account.download('BACKUP');
  h.account.reviewDeletion();
  assert.equal(h.account.snapshot().kind, 'READY');
  assert.equal(h.stats().downloads, 0);
});
for (const action of ['BACKUP', 'EXPORT', 'DELETION'] as const)
  test(`${action} single-flight concurrent double click`, async (t) => {
    const gate = deferred<void>();
    let count = 0;
    const changes: Partial<AccountClient> =
      action === 'DELETION'
        ? {
            deletion: async (_key, _signal, sent) => {
              sent();
              count++;
              await gate.promise;
              return acceptedDeletion;
            },
          }
        : action === 'BACKUP'
          ? {
              backup: async () => {
                count++;
                await gate.promise;
                return backup();
              },
            }
          : {
              export: async () => {
                count++;
                await gate.promise;
                return accountExport();
              },
            };
    const h = setup(changes);
    t.after(h.close);
    await h.controller.refresh();
    if (action === 'DELETION') h.account.reviewDeletion();
    const a =
        action === 'DELETION'
          ? h.account.confirmDeletion()
          : h.account.download(action),
      b =
        action === 'DELETION'
          ? h.account.confirmDeletion()
          : h.account.download(action);
    assert.equal(count, 1);
    gate.resolve();
    await Promise.all([a, b]);
  });
for (const action of ['BACKUP', 'EXPORT', 'DELETION'] as const)
  test(`${action} offline prevents network and doesn't queue on reconnect`, async (t) => {
    const h = setup();
    t.after(h.close);
    await h.controller.refresh();
    h.offline();
    if (action === 'DELETION') {
      h.account.reviewDeletion();
      await h.account.confirmDeletion();
    } else await h.account.download(action);
    assert.equal(
      h.stats().backupCalls + h.stats().exportCalls + h.keys.length,
      0,
    );
    assert.match(h.account.snapshot().message, /Sin conexión/);
  });
test('same-session polling preserves confirmation and does not renew recent-auth via browser clock', async (t) => {
  const h = setup();
  t.after(h.close);
  await h.controller.refresh();
  h.account.reviewDeletion();
  const generation = h.controller.snapshot().generation;
  await h.controller.refresh();
  assert.equal(h.account.snapshot().kind, 'REVIEW');
  assert.equal(h.controller.snapshot().generation, generation);
  assert.equal(h.stats().loginCalls, 0);
  assert.equal(h.keys.length, 0);
});
for (const boundary of ['user', 'business', 'inventory', 'logout'] as const)
  test(`late export fenced after ${boundary} boundary`, async (t) => {
    const gate = deferred<ReturnType<typeof accountExport>>();
    const h = setup({ export: () => gate.promise });
    t.after(h.close);
    await h.controller.refresh();
    const pending = h.account.download('EXPORT');
    if (boundary === 'logout') await h.controller.logout();
    else {
      const meta = structuredClone(me);
      if (boundary === 'user') {
        meta.user.id = 'user-b';
        meta.user.email = 'b@example.test';
      }
      if (boundary === 'business')
        meta.business!.id = '019e3000-0000-7000-8000-000000000077';
      if (boundary === 'inventory')
        meta.inventory!.id = '019e3000-0000-7000-8000-000000000088';
      h.change(meta);
      await h.controller.refresh();
    }
    gate.resolve(accountExport());
    await pending;
    assert.equal(h.stats().downloads, 0);
    assert.equal(h.account.snapshot().message, '');
  });
test('lost POST + 401 is uncertain, never failed, no unauthenticated retry or receipt', async (t) => {
  let calls = 0;
  const h = setup({
    deletion: async (_key, _signal, sent) => {
      sent();
      calls++;
      throw failure(401);
    },
  });
  t.after(h.close);
  await h.controller.refresh();
  h.account.reviewDeletion();
  await h.account.confirmDeletion();
  assert.equal(h.account.snapshot().kind, 'UNKNOWN');
  assert.equal(h.account.snapshot().message, deletionUnknown);
  assert.equal(h.controller.snapshot().kind, 'ANONYMOUS');
  await h.account.retryDeletion();
  assert.equal(calls, 1);
  assert.equal(h.account.snapshot().canRetry, false);
});
test('same-tab ambiguous POST retry preserves exact key; no new request automatically', async (t) => {
  const keys: string[] = [];
  const h = setup({
    deletion: async (key, _signal, sent) => {
      sent();
      keys.push(key);
      if (keys.length === 1) throw new ApiClientError('NETWORK', null);
      return acceptedDeletion;
    },
  });
  t.after(h.close);
  await h.controller.refresh();
  h.account.reviewDeletion();
  await h.account.confirmDeletion();
  assert.equal(keys.length, 1);
  assert.equal(h.account.snapshot().kind, 'UNKNOWN');
  await h.controller.refresh();
  assert.equal(keys.length, 1);
  await h.account.retryDeletion();
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
  assert.equal(h.account.snapshot().kind, 'ACCEPTED');
});
test('revocation while POST in flight retains public uncertainty and fences late acceptance', async (t) => {
  const gate = deferred<typeof acceptedDeletion>();
  const h = setup({
    deletion: async (_key, _signal, sent) => {
      sent();
      return gate.promise;
    },
  });
  t.after(h.close);
  await h.controller.refresh();
  h.account.reviewDeletion();
  const pending = h.account.confirmDeletion();
  h.controller.expire();
  assert.equal(h.account.snapshot().message, deletionUnknown);
  gate.resolve(acceptedDeletion);
  await pending;
  assert.equal(h.account.snapshot().kind, 'UNKNOWN');
});
test('accepted deletion clears private Query cache and keeps public notice after revoked-session polling', async (t) => {
  const h = setup();
  t.after(h.close);
  await h.controller.refresh();
  h.queries.setQueryData(['private', 'commercial'], { canary: 'private' });
  h.account.reviewDeletion();
  await h.account.confirmDeletion();
  assert.equal(h.queries.getQueryCache().getAll().length, 0);
  assert.equal(h.account.snapshot().message, deletionAccepted);
  h.controller.expire();
  assert.equal(h.account.snapshot().message, deletionAccepted);
  h.auth.session = async () => {
    throw failure(500);
  };
  await h.controller.refresh();
  assert.equal(h.account.snapshot().message, deletionAccepted);
  h.auth.session = async () => ({ ...identity, userId: 'user-b' });
  h.change({
    ...me,
    user: { ...me.user, id: 'user-b', email: 'b@example.test' },
  });
  await h.controller.refresh();
  assert.equal(h.account.snapshot().message, '');
});
test('SESSION_NOT_FRESH is specific; official same-user login clears confirmation and does not replay actions', async (t) => {
  const h = setup({
    export: async () => {
      throw failure(403, 'SESSION_NOT_FRESH');
    },
  });
  t.after(h.close);
  await h.controller.refresh();
  await h.account.download('EXPORT');
  assert.equal(h.account.snapshot().kind, 'REAUTH_REQUIRED');
  assert.equal(h.controller.snapshot().kind, 'BUSINESS_ACTIVE_ENABLED');
  await h.account.reauthenticate('synthetic-password');
  assert.equal(h.stats().loginCalls, 1);
  assert.equal(h.keys.length, 0);
  assert.match(h.account.snapshot().message, /Inicia nuevamente/);
  assert.equal(h.stats().downloads, 0);
  h.account.reviewDeletion();
  assert.equal(h.account.snapshot().kind, 'REVIEW');
});
test('reauth unexpected account switch cancels action and signs out instead of claiming same-user freshness', async (t) => {
  const h = setup();
  t.after(h.close);
  await h.controller.refresh();
  h.auth.login = async () =>
    h.change({
      ...me,
      user: { ...me.user, id: 'user-b', email: 'b@example.test' },
    });
  await h.account.reauthenticate('synthetic-password');
  assert.equal(h.controller.snapshot().kind, 'ANONYMOUS');
  assert.equal(h.account.snapshot().kind, 'ERROR');
  assert.equal(h.keys.length, 0);
  assert.equal(h.stats().downloads, 0);
});
for (const status of [401, 403, 404, 409, 429, 500])
  test(`download ${status} sanitized; no file or payload cache`, async (t) => {
    const h = setup({
      export: async () => {
        throw failure(status);
      },
    });
    t.after(h.close);
    await h.controller.refresh();
    await h.account.download('EXPORT');
    assert.equal(h.account.snapshot().kind, 'ERROR');
    assert.ok(!h.account.snapshot().message.includes('raw-fixture-canary'));
    assert.equal(h.stats().downloads, 0);
    assert.equal(
      h.queries
        .getQueryCache()
        .getAll()
        .some((q) => q.queryKey.includes('export')),
      false,
    );
  });
for (const status of [403, 404, 409, 429])
  test(`deletion terminal ${status} does not masquerade as accepted or retry automatically`, async (t) => {
    let count = 0;
    const h = setup({
      deletion: async (_key, _signal, sent) => {
        sent();
        count++;
        throw failure(status);
      },
    });
    t.after(h.close);
    await h.controller.refresh();
    h.account.reviewDeletion();
    await h.account.confirmDeletion();
    assert.equal(h.account.snapshot().kind, 'ERROR');
    await h.account.retryDeletion();
    assert.equal(count, 1);
  });
test('export identity mismatch and foreign backup are rejected before file handoff', async (t) => {
  const bad = accountExport();
  bad.user.id = 'user-b';
  const h = setup({ export: async () => bad });
  t.after(h.close);
  await h.controller.refresh();
  await h.account.download('EXPORT');
  assert.equal(h.stats().downloads, 0);
  assert.equal(h.account.snapshot().kind, 'ERROR');
  bad.user.id = me.user.id;
  bad.backup!.inventoryId = 'foreign';
  await h.account.download('EXPORT');
  assert.equal(h.stats().downloads, 0);
});
test('real navigation clears deletion review without POST', async (t) => {
  const h = setup();
  t.after(h.close);
  await h.controller.refresh();
  h.account.reviewDeletion();
  h.account.routeChanged('/settings');
  assert.equal(h.account.snapshot().kind, 'READY');
  await h.account.confirmDeletion();
  assert.equal(h.keys.length, 0);
});
test('error code semantics remain distinct and never render raw exception', () => {
  assert.match(
    accountError(failure(403, 'SESSION_NOT_FRESH')),
    /iniciar sesión/,
  );
  assert.match(accountError(failure(403, 'CLOUD_ACCESS_DISABLED')), /descarga/);
  assert.ok(!accountError(new Error('SQL_SECRET')).includes('SQL_SECRET'));
});

test('deletion POST rejected for stale session requires reauth, not an uncertain write', async (t) => {
  const h = setup({
    deletion: async (_key, _signal, sent) => {
      sent();
      throw failure(403, 'SESSION_NOT_FRESH');
    },
  });
  t.after(h.close);
  await h.controller.refresh();
  h.account.reviewDeletion();
  await h.account.confirmDeletion();
  assert.equal(h.account.snapshot().kind, 'REAUTH_REQUIRED');
  assert.equal(h.controller.snapshot().kind, 'BUSINESS_ACTIVE_ENABLED');
  await h.account.retryDeletion();
  assert.equal(h.keys.length, 0);
});
for (const status of [500, 503, 202])
  test(`ambiguous deletion ${status} conserves intention; never implies success`, async (t) => {
    const h = setup({
      deletion: async (_key, _signal, sent) => {
        sent();
        throw status === 202
          ? new ApiClientError('INVALID_JSON', 202)
          : failure(status);
      },
    });
    t.after(h.close);
    await h.controller.refresh();
    h.account.reviewDeletion();
    await h.account.confirmDeletion();
    assert.equal(h.account.snapshot().kind, 'UNKNOWN');
    assert.equal(h.account.snapshot().canRetry, true);
    assert.equal(h.account.snapshot().message, deletionUnknown);
  });
test('late deletion result from A never reports acceptance for B', async (t) => {
  const gate = deferred<typeof acceptedDeletion>();
  const h = setup({
    deletion: async (_key, _signal, sent) => {
      sent();
      return gate.promise;
    },
  });
  t.after(h.close);
  await h.controller.refresh();
  h.account.reviewDeletion();
  const pending = h.account.confirmDeletion();
  h.change({
    ...me,
    user: { ...me.user, id: 'user-b', email: 'b@example.test' },
  });
  await h.controller.refresh();
  gate.resolve(acceptedDeletion);
  await pending;
  assert.equal(h.account.snapshot().kind, 'READY');
  assert.equal(h.account.snapshot().message, '');
  assert.equal(h.controller.snapshot().kind, 'BUSINESS_ACTIVE_ENABLED');
});
test('new official login during DELETING permits conscious repeat, never auto-POST', async (t) => {
  let count = 0;
  const h = setup({
    deletion: async (_key, _signal, sent) => {
      sent();
      count++;
      if (count === 1) throw new ApiClientError('NETWORK', null);
      return acceptedDeletion;
    },
  });
  t.after(h.close);
  await h.controller.refresh();
  h.account.reviewDeletion();
  await h.account.confirmDeletion();
  const meta = structuredClone(me);
  meta.business!.status = 'DELETING';
  meta.business!.cloudAccessEnabled = false;
  h.change(meta);
  await h.controller.refresh();
  await h.account.reauthenticate('synthetic-password');
  assert.equal(count, 1);
  await h.account.retryDeletion();
  assert.equal(count, 1);
  h.account.reviewDeletion();
  await h.account.confirmDeletion();
  assert.equal(count, 2);
  assert.equal(h.account.snapshot().kind, 'ACCEPTED');
});
test('download handoff failure is recoverable, with no false saved claim', async (t) => {
  const f = fixture();
  await f.controller.refresh();
  let handoffs = 0;
  const controller = new AccountController(
    {
      backup: async () => backup(),
      export: async () => accountExport(),
      deletion: async () => acceptedDeletion,
    },
    f.controller,
    new JsonDownloads({
      create: () => 'blob:x',
      revoke: () => {},
      schedule: (fn) => fn(),
      handoff: () => {
        if (++handoffs === 1) throw new Error('cancelled');
      },
    }),
    () => true,
  );
  t.after(() => {
    controller.dispose();
    f.controller.dispose();
    f.queries.clear();
  });
  await controller.download('BACKUP');
  assert.equal(controller.snapshot().kind, 'ERROR');
  await controller.download('BACKUP');
  assert.equal(controller.snapshot().kind, 'READY');
  assert.match(controller.snapshot().message, /Comprueba/);
  assert.ok(!controller.snapshot().message.includes('guardamos'));
});
test('account lifecycle and downloads never access persistent storage', async (t) => {
  let storageCalls = 0;
  const descriptors = new Map<string, PropertyDescriptor | undefined>();
  for (const name of ['localStorage', 'sessionStorage', 'indexedDB']) {
    descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      configurable: true,
      get() {
        storageCalls++;
        throw new Error('storage access forbidden');
      },
    });
  }
  t.after(() => {
    for (const [name, old] of descriptors) {
      if (old) Object.defineProperty(globalThis, name, old);
      else Reflect.deleteProperty(globalThis, name);
    }
  });
  const h = setup();
  t.after(h.close);
  await h.controller.refresh();
  await h.account.download('BACKUP');
  await h.account.download('EXPORT');
  h.account.reviewDeletion();
  await h.account.confirmDeletion();
  assert.equal(storageCalls, 0);
  assert.deepEqual(Object.keys(h.account.snapshot()).sort(), [
    'kind',
    'message',
  ]);
});

test('failed auth revalidation fences export and recovery never leaves UI stuck preparing', async (t) => {
  const gate = deferred<ReturnType<typeof accountExport>>();
  const h = setup({ export: () => gate.promise });
  t.after(h.close);
  await h.controller.refresh();
  const pending = h.account.download('EXPORT');
  h.auth.session = async () => {
    throw failure(500);
  };
  await h.controller.refresh();
  gate.resolve(accountExport());
  await pending;
  assert.equal(h.stats().downloads, 0);
  assert.equal(h.account.snapshot().kind, 'READY');
  h.auth.session = async () => identity;
  await h.controller.refresh();
  assert.equal(h.account.snapshot().kind, 'READY');
});
test('failed auth revalidation during POST keeps uncertainty but aborts private intent and late202', async (t) => {
  const gate = deferred<typeof acceptedDeletion>();
  const h = setup({
    deletion: async (_key, _signal, sent) => {
      sent();
      return gate.promise;
    },
  });
  t.after(h.close);
  await h.controller.refresh();
  h.account.reviewDeletion();
  const pending = h.account.confirmDeletion();
  h.auth.session = async () => {
    throw failure(500);
  };
  await h.controller.refresh();
  assert.equal(h.account.snapshot().kind, 'UNKNOWN');
  assert.equal(h.account.snapshot().canRetry, undefined);
  gate.resolve(acceptedDeletion);
  await pending;
  assert.equal(h.account.snapshot().kind, 'UNKNOWN');
});

test('same-user dataset disappearance during POST keeps uncertainty without retrying in a new scope', async (t) => {
  const gate = deferred<typeof acceptedDeletion>();
  let calls = 0;
  const h = setup({
    deletion: async (_key, _signal, sent) => {
      calls++;
      sent();
      return gate.promise;
    },
  });
  t.after(h.close);
  await h.controller.refresh();
  h.account.reviewDeletion();
  const pending = h.account.confirmDeletion();
  h.change({ ...me, business: null, inventory: null });
  await h.controller.refresh();
  assert.equal(h.account.snapshot().kind, 'UNKNOWN');
  assert.equal(h.account.snapshot().canRetry, undefined);
  await h.account.retryDeletion();
  assert.equal(calls, 1);
  gate.resolve(acceptedDeletion);
  await pending;
  assert.equal(h.account.snapshot().message, deletionUnknown);
});
