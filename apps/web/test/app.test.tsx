import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryRouter } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { App } from '../src/app/app.js';
import { createAppRoutes } from '../src/app/router.js';
import { createWebQueryClient } from '../src/app/providers.js';
import { FoundationPage } from '../src/routes/foundation.js';

async function initialized(router: ReturnType<typeof createMemoryRouter>) {
  if (router.state.initialized) return;
  await new Promise<void>((resolve) => {
    const unsubscribe = router.subscribe((state) => {
      if (state.initialized) {
        unsubscribe();
        resolve();
      }
    });
  });
}

test('SPA root renders semantic foundation with real Router/Query composition and no network calls', async (t) => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error('Unexpected foundation request.');
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const router = createMemoryRouter(createAppRoutes(), {
    initialEntries: ['/'],
  });
  t.after(() => router.dispose());
  const client = createWebQueryClient();
  t.after(() => client.clear());
  await initialized(router);
  const html = renderToStaticMarkup(
    <App router={router} queryClient={client} />,
  );
  assert.match(html, /<main>/);
  assert.match(html, /<h1>Aplicación web<\/h1>/);
  assert.match(html, /href="\/login"/);
  assert.equal(client.getQueryCache().getAll().length, 0);
  assert.equal(client.getMutationCache().getAll().length, 0);
  assert.equal(calls, 0);
});

test('all approved known paths resolve as placeholders, including new vs id/edit route precedence', async (t) => {
  for (const path of [
    '/login',
    '/signup',
    '/verify-email',
    '/reset-password',
    '/onboarding',
    '/products',
    '/products/new',
    '/products/fixture',
    '/products/fixture/edit',
    '/sales/new',
    '/sales/fixture',
    '/purchases/new',
    '/purchases/fixture',
    '/adjustments/new',
    '/history',
    '/settings',
    '/settings/privacy',
  ]) {
    const router = createMemoryRouter(createAppRoutes(), {
      initialEntries: [path],
    });
    t.after(() => router.dispose());
    await initialized(router);
    const html = renderToStaticMarkup(
      <App router={router} queryClient={createWebQueryClient()} />,
    );
    assert.match(html, /Las pantallas se incorporarán por etapas/);
    assert.doesNotMatch(html, /Página no encontrada/);
    if (path === '/products/new') assert.match(html, /Nuevo producto/);
    if (path === '/products/fixture/edit')
      assert.match(html, /Editar producto/);
  }
});

test('unknown deep link renders Not Found with a usable home link', async (t) => {
  const router = createMemoryRouter(createAppRoutes(), {
    initialEntries: ['/unknown/deep'],
  });
  t.after(() => router.dispose());
  await initialized(router);
  const html = renderToStaticMarkup(
    <App router={router} queryClient={createWebQueryClient()} />,
  );
  assert.match(html, /Página no encontrada/);
  assert.match(html, /href="\/"/);
});

test('Query client context is the same instance used by routed components, with online finite retry policy', async (t) => {
  const client = createWebQueryClient();
  t.after(() => client.clear());
  function Probe() {
    assert.equal(useQueryClient(), client);
    return <main>Provider listo</main>;
  }
  const router = createMemoryRouter([{ path: '/', Component: Probe }]);
  t.after(() => router.dispose());
  assert.match(
    renderToStaticMarkup(<App router={router} queryClient={client} />),
    /Provider listo/,
  );
  assert.equal(client.getDefaultOptions().queries?.retry, false);
  assert.equal(client.getDefaultOptions().mutations?.retry, false);
  assert.equal(client.getDefaultOptions().queries?.networkMode, 'online');
  assert.equal(client.getDefaultOptions().mutations?.networkMode, 'online');
});

test('lazy initial route and later navigation expose accessible loading before resolving', async (t) => {
  let release: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  const routes = createAppRoutes();
  routes[0]!.children = [
    { index: true, Component: () => <FoundationPage title="Inicio" /> },
    {
      path: '/products',
      lazy: async () => {
        await ready;
        return { Component: () => <FoundationPage title="Productos" /> };
      },
    },
  ];
  const router = createMemoryRouter(routes);
  t.after(() => router.dispose());
  const client = createWebQueryClient();
  const pending = router.navigate('/products');
  assert.equal(router.state.navigation.state, 'loading');
  const loading = renderToStaticMarkup(
    <App router={router} queryClient={client} />,
  );
  assert.match(loading, /role="status"/);
  assert.match(loading, /aria-live="polite"/);
  release?.();
  await pending;
  assert.match(
    renderToStaticMarkup(<App router={router} queryClient={client} />),
    /Productos/,
  );

  let releaseInitial: (() => void) | undefined;
  const initialReady = new Promise<void>((resolve) => {
    releaseInitial = resolve;
  });
  const initialRoutes = createAppRoutes();
  initialRoutes[0]!.children = [
    {
      index: true,
      lazy: async () => {
        await initialReady;
        return { Component: () => <FoundationPage title="Inicio" /> };
      },
    },
  ];
  const initialRouter = createMemoryRouter(initialRoutes);
  t.after(() => initialRouter.dispose());
  assert.match(
    renderToStaticMarkup(<App router={initialRouter} queryClient={client} />),
    /Cargando/,
  );
  releaseInitial?.();
  await initialized(initialRouter);
});

test('route failures use basic public error UI and do not display raw exception details', async (t) => {
  const routes = createAppRoutes();
  routes[0]!.children = [
    {
      index: true,
      lazy: async () => {
        throw new Error('private exception canary');
      },
    },
  ];
  const router = createMemoryRouter(routes);
  t.after(() => router.dispose());
  await initialized(router);
  const html = renderToStaticMarkup(
    <App router={router} queryClient={createWebQueryClient()} />,
  );
  assert.match(html, /No pudimos abrir esta página/);
  assert.doesNotMatch(html, /private exception canary/);
});
