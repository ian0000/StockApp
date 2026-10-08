import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryRouter } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { App } from '../src/app/app.js';
import { createAppRoutes } from '../src/app/router.js';
import { FoundationPage } from '../src/routes/foundation.js';
import { fixture, me, deferred } from './session-fixtures.js';
import { PrivateBoundary } from '../src/routes/access.js';

async function initialized(router: ReturnType<typeof createMemoryRouter>) {
  if (router.state.initialized) return;
  await new Promise<void>((resolve) => {
    const stop = router.subscribe((state) => {
      if (state.initialized) {
        stop();
        resolve();
      }
    });
  });
}
async function renderPath(path: string, context = fixture()) {
  await context.controller.refresh();
  const router = createMemoryRouter(createAppRoutes(), {
    initialEntries: [path],
  });
  await initialized(router);
  const html = renderToStaticMarkup(
    <App
      router={router}
      queryClient={context.queries}
      session={context.controller}
    />,
  );
  router.dispose();
  context.controller.dispose();
  context.queries.clear();
  return html;
}

test('enabled root shows real inventory metadata, semantic navigation, active state and logout without metrics', async () => {
  const html = await renderPath('/');
  assert.ok(html.includes('<main>'));
  assert.ok(html.includes('Inventario conectado'));
  assert.ok(html.includes('Inventario A'));
  for (const label of [
    'Inicio',
    'Productos',
    'Historial',
    'Configuración',
    'Nueva venta',
    'Nueva compra',
    'Cerrar sesión',
  ])
    assert.ok(html.includes(label));
  assert.ok(html.includes('aria-current="page"'));
  assert.ok(html.includes('EUR'));
  assert.ok(html.includes('Europe/Madrid'));
  assert.ok(html.includes('href="#app-content"'));
  assert.ok(!html.includes('Rutas de demostración'));
});
test('private commercial placeholders render inside authenticated shell including new/id/edit precedence', async () => {
  for (const path of [
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
    const html = await renderPath(path);
    assert.ok(html.includes('Navegación principal'));
    assert.ok(html.includes('Las pantallas se incorporarán por etapas'));
    if (path === '/products/new') assert.ok(html.includes('Nuevo producto'));
    if (path.endsWith('/edit')) assert.ok(html.includes('Editar producto'));
  }
});
test('public auth screens expose labeled usable forms and no private shell', async () => {
  for (const path of [
    '/login',
    '/signup',
    '/verify-email',
    '/reset-password',
  ]) {
    const html = await renderPath(path, fixture({ session: async () => null }));
    assert.ok(html.includes('<form'));
    assert.ok(html.includes('<label>'));
    assert.ok(html.toLowerCase().includes('autocomplete="email"'));
    assert.ok(html.includes('aria-describedby="form-message"'));
    assert.ok(html.includes('aria-live="polite"'));
    assert.ok(!html.includes('Navegación principal'));
    assert.ok(!html.includes('Inventario A'));
  }
});
test('anonymous and no-business private boundary render only the redirect, with no private data', async () => {
  for (const ctx of [
    fixture({ session: async () => null }),
    fixture(
      {},
      { me: async () => ({ ...me, business: null, inventory: null }) },
    ),
  ]) {
    const html = await renderPath('/products', ctx);
    assert.equal(html, '');
    assert.ok(
      ['ANONYMOUS', 'NO_BUSINESS'].includes(ctx.controller.snapshot().kind),
    );
  }
});
test('onboarding has exact fields, empty currency/name and no upload or enable control', async () => {
  const html = await renderPath(
    '/onboarding',
    fixture(
      {},
      { me: async () => ({ ...me, business: null, inventory: null }) },
    ),
  );
  assert.ok(html.includes('Crear inventario vacío'));
  assert.ok(html.includes('Moneda (ISO de tres letras)'));
  const currencyInput = html.match(
    /<input\b[^>]*placeholder="Ejemplo: USD"[^>]*>/,
  )?.[0];
  assert.ok(currencyInput);
  assert.match(currencyInput, /value=""/);
  assert.match(currencyInput, /pattern="\[A-Z\]\{3\}"/);
  assert.ok(!html.includes('type="file"'));
  assert.ok(!html.includes('Habilitar cloud'));
});
test('disabled/deleting/reserved states withdraw shell and allow refresh/logout', async () => {
  assert.ok(me.business);
  for (const [response, title] of [
    [
      { ...me, business: { ...me.business, cloudAccessEnabled: false } },
      'Acceso cloud pendiente',
    ],
    [
      { ...me, business: { ...me.business, status: 'DELETING' as const } },
      'Tu cuenta está en proceso de eliminación.',
    ],
    [{ ...me, inventory: null }, 'Configuración pendiente'],
  ] as const) {
    const html = await renderPath(
      '/products',
      fixture({}, { me: async () => response }),
    );
    assert.ok(html.includes(title));
    assert.ok(html.includes('Refrescar estado'));
    assert.ok(html.includes('Cerrar sesión'));
    assert.ok(!html.includes('Navegación principal'));
    assert.ok(!html.includes('Las pantallas se incorporarán'));
  }
});
test('unknown deep link renders Not Found with home link', async () => {
  const html = await renderPath('/unknown/deep');
  assert.ok(html.includes('Página no encontrada'));
  assert.ok(html.includes('href="/"'));
});

test('official verify/reset callbacks render usable safe states without leaking tokens or raw error values', async () => {
  const anon = () => fixture({ session: async () => null });
  const reset = await renderPath('/reset-password?token=PRIVATE-TOKEN', anon());
  assert.ok(reset.includes('Nueva contraseña'));
  assert.ok(reset.includes('type="password"'));
  assert.ok(!reset.includes('PRIVATE-TOKEN'));
  const verified = await renderPath('/verify-email?verified=1', anon());
  assert.ok(verified.includes('Correo verificado'));
  assert.ok(verified.includes('href="/login"'));
  const verifyError = await renderPath(
    '/verify-email?verified=1&error=PRIVATE-SQL',
    anon(),
  );
  assert.ok(verifyError.includes('El enlace no pudo verificarse'));
  assert.ok(!verifyError.includes('PRIVATE-SQL'));
  const resetError = await renderPath(
    '/reset-password?error=PRIVATE-SQL',
    anon(),
  );
  assert.ok(resetError.includes('El enlace venció o no es válido'));
  assert.ok(!resetError.includes('PRIVATE-SQL'));
});
test('Query provider supplies exact same instance with online policy', async (t) => {
  const ctx = fixture();
  t.after(() => ctx.queries.clear());
  function Probe() {
    assert.equal(useQueryClient(), ctx.queries);
    return <main>Provider listo</main>;
  }
  const router = createMemoryRouter([{ path: '/', Component: Probe }]);
  t.after(() => router.dispose());
  assert.ok(
    renderToStaticMarkup(
      <App
        router={router}
        queryClient={ctx.queries}
        session={ctx.controller}
      />,
    ).includes('Provider listo'),
  );
  assert.equal(ctx.queries.getDefaultOptions().queries?.retry, false);
  assert.equal(ctx.queries.getDefaultOptions().mutations?.retry, false);
  assert.equal(ctx.queries.getDefaultOptions().queries?.networkMode, 'online');
});
test('initial and navigation lazy loading expose status/aria-live; private loading exposes no old data', async (t) => {
  const ctx = fixture();
  await ctx.controller.refresh();
  const ready = deferred<void>();
  const routes = createAppRoutes();
  routes[0]!.children = [
    { index: true, Component: () => <FoundationPage title="Inicio" /> },
    {
      path: '/products',
      lazy: async () => {
        await ready.promise;
        return { Component: () => <FoundationPage title="Productos" /> };
      },
    },
  ];
  const router = createMemoryRouter(routes);
  t.after(() => router.dispose());
  const pending = router.navigate('/products');
  assert.equal(router.state.navigation.state, 'loading');
  const render = () =>
    renderToStaticMarkup(
      <App
        router={router}
        queryClient={ctx.queries}
        session={ctx.controller}
      />,
    );
  assert.ok(render().includes('role="status"'));
  assert.ok(render().includes('aria-live="polite"'));
  ready.resolve();
  await pending;
  assert.ok(render().includes('Productos'));
  const initial = deferred<void>();
  const initialRoutes = createAppRoutes();
  initialRoutes[0]!.children = [
    {
      index: true,
      lazy: async () => {
        await initial.promise;
        return { Component: () => <FoundationPage title="Inicio" /> };
      },
    },
  ];
  const initialRouter = createMemoryRouter(initialRoutes);
  t.after(() => initialRouter.dispose());
  assert.ok(
    renderToStaticMarkup(
      <App
        router={initialRouter}
        queryClient={ctx.queries}
        session={ctx.controller}
      />,
    ).includes('Cargando'),
  );
  initial.resolve();
  await initialized(initialRouter);
  const loadingCtx = fixture();
  const privateRouter = createMemoryRouter([
    { path: '/', Component: PrivateBoundary },
  ]);
  t.after(() => privateRouter.dispose());
  const html = renderToStaticMarkup(
    <App
      router={privateRouter}
      queryClient={loadingCtx.queries}
      session={loadingCtx.controller}
    />,
  );
  assert.ok(html.includes('Cargando'));
  assert.ok(!html.includes('Inventario A'));
});
test('route failures use sanitized error UI', async (t) => {
  const ctx = fixture();
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
    <App router={router} queryClient={ctx.queries} session={ctx.controller} />,
  );
  assert.ok(html.includes('No pudimos abrir esta página'));
  assert.ok(!html.includes('private exception canary'));
});
