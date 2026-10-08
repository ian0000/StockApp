import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MeResponse } from '@stock-app/contracts';
import { ApiClientError } from '../src/api/client.js';
import { AuthFailure } from '../src/auth/client.js';
import {
  accessState,
  privateDestination,
  privateQueryKey,
} from '../src/auth/session.js';
import { fixture, identity, me, deferred } from './session-fixtures.js';

test('anonymous startup never calls business endpoints and private routing requires login', async () => {
  let calls = 0;
  const ctx = fixture(
    { session: async () => null },
    {
      me: async () => {
        calls++;
        return me;
      },
    },
  );
  await ctx.controller.refresh();
  assert.equal(ctx.controller.snapshot().kind, 'ANONYMOUS');
  assert.equal(privateDestination(ctx.controller.snapshot()), '/login');
  assert.equal(calls, 0);
});
test('access machine resolves all six me states from server fields', () => {
  assert.ok(me.business);
  assert.equal(
    accessState({ ...me, business: null, inventory: null }),
    'NO_BUSINESS',
  );
  assert.equal(
    accessState({
      ...me,
      business: { ...me.business, cloudAccessEnabled: false },
    }),
    'BUSINESS_ACTIVE_DISABLED',
  );
  assert.equal(accessState(me), 'BUSINESS_ACTIVE_ENABLED');
  assert.equal(
    accessState({ ...me, business: { ...me.business, status: 'DELETING' } }),
    'BUSINESS_DELETING',
  );
  assert.equal(
    accessState({ ...me, inventory: null }),
    'BUSINESS_WITHOUT_INVENTORY',
  );
  assert.equal(
    accessState({
      ...me,
      business: { ...me.business, cloudAccessEnabled: false },
      inventory: null,
    }),
    'BUSINESS_WITHOUT_INVENTORY',
  );
});
test('login clears old queries immediately, waits for session and me before admitting shell, new login bumps generation', async () => {
  const login = deferred<void>();
  const lookup = deferred<MeResponse>();
  const ctx = fixture(
    { login: () => login.promise },
    { me: () => lookup.promise },
  );
  ctx.queries.setQueryData(['private', 'old'], 'PRIVATE-A');
  const before = ctx.controller.snapshot().generation;
  const pending = ctx.controller.login('a@example.test', 'password-fixture');
  assert.equal(ctx.queries.getQueryCache().getAll().length, 0);
  assert.equal(ctx.controller.snapshot().kind, 'LOADING_SESSION');
  login.resolve();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(ctx.controller.snapshot().kind, 'AUTHENTICATED_LOADING_ME');
  lookup.resolve(me);
  await pending;
  assert.equal(ctx.controller.snapshot().kind, 'BUSINESS_ACTIVE_ENABLED');
  assert.ok(ctx.controller.snapshot().generation > before);
});
test('invalid login uses safe auth message and leaves anonymous without old query data', async () => {
  const ctx = fixture({
    login: async () => {
      throw new AuthFailure('INVALID_EMAIL_OR_PASSWORD', 401);
    },
  });
  ctx.queries.setQueryData(['old'], 'private');
  await assert.rejects(
    ctx.controller.login('missing@example.test', 'password-fixture'),
    /Revisa el correo y la contraseña/,
  );
  assert.equal(ctx.controller.snapshot().kind, 'ANONYMOUS');
  assert.equal(ctx.queries.getQueryCache().getAll().length, 0);
});
test('same-user ordinary refresh retains generation and cache; another user or another session clears A before B renders', async () => {
  let current = identity;
  let response = me;
  const ctx = fixture(
    { session: async () => current },
    { me: async () => response },
  );
  await ctx.controller.refresh();
  const generation = ctx.controller.snapshot().generation;
  const key = privateQueryKey(
    generation,
    me.business!.id,
    me.inventory!.id,
    'products',
  );
  ctx.queries.setQueryData(key, 'PRIVATE-A');
  await ctx.controller.refresh();
  assert.equal(ctx.controller.snapshot().generation, generation);
  assert.equal(ctx.queries.getQueryData(key), 'PRIVATE-A');
  current = { ...identity, userId: 'user-b', sessionId: 'session-b' };
  response = {
    ...me,
    user: { ...me.user, id: 'user-b', email: 'b@example.test' },
  };
  ctx.controller.subscribe(() => {
    if (ctx.controller.snapshot().kind === 'AUTHENTICATED_LOADING_ME')
      assert.equal(ctx.queries.getQueryData(key), undefined);
  });
  await ctx.controller.refresh();
  assert.ok(ctx.controller.snapshot().generation > generation);
  assert.equal(ctx.queries.getQueryData(key), undefined);
  const second = ctx.controller.snapshot().generation;
  current = { ...current, sessionId: 'new-session-b' };
  await ctx.controller.refresh();
  assert.ok(ctx.controller.snapshot().generation > second);
});
test('logout withdraws queries/UI at start and only marks anonymous after official sign-out succeeds', async () => {
  const signout = deferred<void>();
  const ctx = fixture({ logout: () => signout.promise });
  await ctx.controller.refresh();
  const before = ctx.controller.snapshot().generation;
  ctx.queries.setQueryData(['old'], 'PRIVATE');
  const pending = ctx.controller.logout();
  assert.equal(ctx.controller.snapshot().kind, 'LOGGING_OUT');
  assert.equal(ctx.queries.getQueryCache().getAll().length, 0);
  signout.resolve();
  await pending;
  assert.equal(ctx.controller.snapshot().kind, 'ANONYMOUS');
  assert.ok(ctx.controller.snapshot().generation > before);
});
test('failed sign-out does not claim server revocation, keeps queries removed and locks auto-refresh until retry', async () => {
  let fail = true;
  const ctx = fixture({
    logout: async () => {
      if (fail) throw new Error('raw private network');
    },
  });
  await ctx.controller.refresh();
  await ctx.controller.logout();
  const view = ctx.controller.snapshot();
  assert.equal(view.kind, 'LOGOUT_ERROR');
  assert.ok(
    'message' in view &&
      view.message.includes('no pudimos cerrar la sesión en el servidor'),
  );
  await ctx.controller.refresh();
  assert.equal(ctx.controller.snapshot().kind, 'LOGOUT_ERROR');
  assert.equal(ctx.queries.getQueryCache().getAll().length, 0);
  fail = false;
  await ctx.controller.logout();
  assert.equal(ctx.controller.snapshot().kind, 'ANONYMOUS');
});
test('null, expired, revoked auth and me 401 all clear queries and return to login', async () => {
  for (const failure of ['null', 'expiry', 'auth401', 'me401'] as const) {
    let revoke = false;
    const ctx = fixture(
      {
        session: async () => {
          if (!revoke) return identity;
          if (failure === 'auth401') throw new AuthFailure(undefined, 401);
          if (failure === 'null') return null;
          return failure === 'expiry'
            ? { ...identity, expiresAt: 0 }
            : identity;
        },
      },
      {
        me: async () => {
          if (revoke && failure === 'me401')
            throw new ApiClientError('HTTP', 401);
          return me;
        },
      },
    );
    await ctx.controller.refresh();
    const generation = ctx.controller.snapshot().generation;
    revoke = true;
    await ctx.controller.refresh();
    assert.equal(privateDestination(ctx.controller.snapshot()), '/login');
    assert.equal(ctx.queries.getQueryCache().getAll().length, 0);
    assert.ok(ctx.controller.snapshot().generation > generation);
  }
});
test('reset completion withdraws context, revokes via official method and does not auto-login', async () => {
  const sent: string[] = [];
  const ctx = fixture({
    reset: async (token, password) => {
      sent.push(token, password);
    },
  });
  await ctx.controller.refresh();
  await ctx.controller.reset('reset-fixture', 'new-password-fixture');
  assert.deepEqual(sent, ['reset-fixture', 'new-password-fixture']);
  assert.equal(ctx.controller.snapshot().kind, 'ANONYMOUS');
  assert.equal(ctx.queries.getQueryCache().getAll().length, 0);
});
test('bootstrap refreshes authoritative me; creation does not assume cloud enabled and matching retry behaves equally', async () => {
  assert.ok(me.business);
  assert.ok(me.inventory);
  let created = false;
  const disabled: MeResponse = {
    ...me,
    business: { ...me.business, cloudAccessEnabled: false },
  };
  const ctx = fixture(
    {},
    {
      me: async () =>
        created ? disabled : { ...me, business: null, inventory: null },
      bootstrap: async (input) => {
        assert.deepEqual(input, {
          inventoryName: 'Real',
          currency: 'EUR',
          reportingTimeZone: 'Europe/Madrid',
        });
        created = true;
        return { business: disabled.business!, inventory: me.inventory! };
      },
    },
  );
  await ctx.controller.refresh();
  assert.equal(privateDestination(ctx.controller.snapshot()), '/onboarding');
  await ctx.controller.bootstrap({
    inventoryName: 'Real',
    currency: 'EUR',
    reportingTimeZone: 'Europe/Madrid',
  });
  assert.equal(ctx.controller.snapshot().kind, 'BUSINESS_ACTIVE_DISABLED');
});
test('late me response after logout or account switch cannot repopulate cleared context/cache', async () => {
  const waiting = deferred<MeResponse>();
  const ctx = fixture({}, { me: () => waiting.promise });
  const pending = ctx.controller.refresh();
  await new Promise<void>((resolve) => setImmediate(resolve));
  await ctx.controller.logout();
  waiting.resolve(me);
  await pending;
  assert.equal(ctx.controller.snapshot().kind, 'ANONYMOUS');
  assert.equal(ctx.queries.getQueryCache().getAll().length, 0);
});
test('late session response cannot reauthenticate after logout and login is single-flight', async () => {
  const waiting = deferred<typeof identity>();
  const login = deferred<void>();
  let calls = 0;
  const ctx = fixture({
    session: () => waiting.promise,
    login: async () => {
      calls++;
      await login.promise;
    },
  });
  const pending = ctx.controller.refresh();
  await ctx.controller.logout();
  waiting.resolve(identity);
  await pending;
  assert.equal(ctx.controller.snapshot().kind, 'ANONYMOUS');
  const first = ctx.controller.login('a', 'password-fixture');
  await ctx.controller.login('b', 'password-fixture');
  assert.equal(calls, 1);
  login.resolve();
  await first;
});
test('mismatched me identity fails closed and clears all private data', async () => {
  const ctx = fixture(
    {},
    { me: async () => ({ ...me, user: { ...me.user, id: 'user-b' } }) },
  );
  await ctx.controller.refresh();
  assert.equal(ctx.controller.snapshot().kind, 'ERROR');
  assert.equal(ctx.queries.getQueryCache().getAll().length, 0);
});
test('email-not-verified me error offers verification without exposing server internals', async () => {
  const ctx = fixture(
    {},
    {
      me: async () => {
        throw new ApiClientError('HTTP', 403, {
          error: {
            code: 'EMAIL_NOT_VERIFIED',
            message: 'public',
            requestId: 'r',
          },
        });
      },
    },
  );
  await ctx.controller.refresh();
  const view = ctx.controller.snapshot();
  assert.equal(view.kind, 'ERROR');
  assert.ok('verification' in view && view.verification);
});

test('cloud-disabled error withdraws shell and offers a safe pending access state', async () => {
  const ctx = fixture(
    {},
    {
      me: async () => {
        throw new ApiClientError('HTTP', 403, {
          error: {
            code: 'CLOUD_ACCESS_DISABLED',
            message: 'public',
            requestId: 'r',
          },
        });
      },
    },
  );
  await ctx.controller.refresh();
  const view = ctx.controller.snapshot();
  assert.equal(view.kind, 'ERROR');
  assert.ok('cloudDisabled' in view && view.cloudDisabled);
});

test('an old account query resolving after B login cannot restore A data', async () => {
  const waiting = deferred<MeResponse>();
  let next = identity;
  let calls = 0;
  const ctx = fixture(
    { session: async () => next },
    {
      me: async () => {
        if (calls++ === 0) return waiting.promise;
        return {
          ...me,
          user: { ...me.user, id: 'user-b', email: 'b@example.test' },
        };
      },
    },
  );
  const old = ctx.controller.refresh();
  await new Promise<void>((resolve) => setImmediate(resolve));
  next = { ...identity, userId: 'user-b', sessionId: 'session-b' };
  await ctx.controller.login('b@example.test', 'password-fixture');
  waiting.resolve(me);
  await old;
  const view = ctx.controller.snapshot();
  assert.ok('me' in view);
  assert.equal(view.me.user.id, 'user-b');
  for (const query of ctx.queries.getQueryCache().getAll())
    assert.ok(!JSON.stringify(query.state.data).includes('a@example.test'));
});
