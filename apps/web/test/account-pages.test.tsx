import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryRouter } from 'react-router';
import type { MeResponse } from '@stock-app/contracts';
import { App } from '../src/app/app.js';
import { createAppRoutes } from '../src/app/router.js';
import { AccountController } from '../src/account/controller.js';
import { createAccountClient } from '../src/account/client.js';
import { createApiClient } from '../src/api/client.js';
import { fixture, me, identity } from './session-fixtures.js';
import { acceptedDeletion } from './account-fixtures.js';
import { retainedAccountMetadata } from '../src/routes/settings.js';
import type { SessionView } from '../src/auth/session.js';
async function render(
  path: string,
  metadata: MeResponse | null = structuredClone(me),
  action?: 'review' | 'accepted' | 'unknown',
) {
  let requests = 0;
  const f = fixture(
    {
      session: async () =>
        metadata ? { ...identity, userId: metadata.user.id } : null,
    },
    {
      me: async () => {
        assert.ok(metadata);
        return metadata;
      },
    },
  );
  await f.controller.refresh();
  const account = new AccountController(
    createAccountClient(
      createApiClient({
        baseUrl: 'https://api.example.test',
        fetcher: async (url) => {
          requests++;
          const p = new URL(String(url)).pathname;
          if (p.endsWith('/csrf')) return Response.json({ token: 'csrf' });
          if (action === 'unknown') throw new Error('lost ACK');
          return Response.json(acceptedDeletion, { status: 202 });
        },
      }),
    ),
    f.controller,
    undefined,
    () => true,
  );
  if (action) account.reviewDeletion();
  if (action === 'accepted' || action === 'unknown')
    await account.confirmDeletion();
  const before = requests;
  const router = createMemoryRouter(createAppRoutes(), {
    initialEntries: [path],
  });
  if (!router.state.initialized)
    await new Promise<void>((resolve) => {
      const stop = router.subscribe((state) => {
        if (state.initialized) {
          stop();
          resolve();
        }
      });
    });
  const html = renderToStaticMarkup(
    <App
      router={router}
      queryClient={f.queries}
      session={f.controller}
      account={account}
    />,
  );
  assert.equal(requests, before);
  router.dispose();
  account.dispose();
  f.controller.dispose();
  f.queries.clear();
  return html;
}
for (const path of [
  '/settings',
  '/settings/privacy',
  '/settings/reauthenticate',
])
  test(`${path} is a real route with no auto export/delete on mount`, async () => {
    const html = await render(path);
    assert.ok(!html.includes('Las pantallas se incorporarán por etapas'));
    assert.ok(html.includes('<main'));
    assert.ok(!html.includes('404'));
  });
test('Settings displays real account/Inventory/currency/timezone read-only without fake editor/version', async () => {
  const html = await render('/settings');
  for (const text of [
    'a@example.test',
    'Inventario A',
    'EUR',
    'Europe/Madrid',
    'valores de consulta',
    'Descargar respaldo',
    'Exportar mi cuenta',
    'Eliminar mi cuenta',
  ])
    assert.ok(html.includes(text));
  assert.ok(!html.includes('<select'));
  assert.ok(!html.includes('<input'));
  assert.ok(!html.includes('Guardar'));
  assert.ok(!html.includes('USD'));
});
for (const state of [
  'enabled',
  'disabled',
  'no-business',
  'no-inventory',
  'deleting',
] as const)
  test(`Privacy ${state} access without commerce bypass`, async () => {
    const metadata = structuredClone(me);
    if (state === 'disabled') metadata.business!.cloudAccessEnabled = false;
    if (state === 'no-business') {
      metadata.business = null;
      metadata.inventory = null;
    }
    if (state === 'no-inventory') metadata.inventory = null;
    if (state === 'deleting') {
      metadata.business!.status = 'DELETING';
      metadata.business!.cloudAccessEnabled = false;
    }
    const html = await render('/settings/privacy', metadata);
    assert.ok(html.includes('Eliminar mi cuenta'));
    assert.ok(html.includes('Datos y privacidad'));
    assert.ok(!html.includes('Nueva venta'));
    assert.ok(!html.includes('Nueva compra'));
    assert.equal(
      html.includes('>Descargar respaldo</button>'),
      state === 'enabled',
    );
    assert.equal(
      html.includes('>Exportar mi cuenta</button>'),
      state !== 'deleting',
    );
    if (state !== 'enabled') {
      const commerce = await render('/products', metadata);
      assert.ok(!commerce.includes('Buscar productos'));
    }
  });
for (const path of ['/settings', '/settings/privacy'])
  test(`anonymous ${path} has no private data/actions`, async () => {
    const html = await render(path, null);
    assert.ok(!html.includes('a@example.test'));
    assert.ok(!html.includes('Exportar mi cuenta'));
    assert.ok(!html.includes('Solicitar eliminación'));
  });
test('irreversible confirmation has explicit cancel/confirm and truthful retention/copies copy', async () => {
  const html = await render('/settings/privacy', me, 'review');
  for (const text of [
    '¿Solicitar',
    'irreversible',
    '>Cancelar</button>',
    'Solicitar eliminación de mi cuenta',
    'revocarán tus sesiones',
    'continuará en el servidor',
    'no pueden eliminarse remotamente',
    'supresión al restaurar',
    'aria-labelledby="deletion-confirm-title"',
  ])
    assert.ok(html.includes(text), text);
  assert.ok(!html.includes('Undo'));
  assert.ok(!html.includes('Todos tus datos ya fueron eliminados'));
  assert.ok(!html.includes('24 horas'));
  assert.ok(!html.includes('30 días'));
});
test('accepted status remains public after session revocation without exposing identity/dataset', async () => {
  const html = await render('/settings/privacy', me, 'accepted');
  assert.ok(html.includes('Eliminación solicitada'));
  assert.ok(html.includes('fue aceptada'));
  assert.ok(html.includes('continuará en el servidor'));
  assert.ok(!html.includes('a@example.test'));
  assert.ok(!html.includes('Inventario A'));
  assert.ok(!html.includes('Todos tus datos ya'));
});
test('unknown outcome offers conscious same-key retry and no false failure/completion', async () => {
  const html = await render('/settings/privacy', me, 'unknown');
  assert.ok(html.includes('No pudimos confirmar'));
  assert.ok(html.includes('Reintentar la misma solicitud'));
  assert.ok(!html.includes('Eliminación solicitada'));
  assert.ok(!html.includes('falló'));
});
test('reauthentication form holds password only transiently and needs explicit new action', async () => {
  const html = await render('/settings/reauthenticate');
  assert.ok(html.includes('type="password"'));
  assert.ok(html.includes('autoComplete="current-password"'));
  assert.ok(html.includes('Iniciar nueva sesión'));
  assert.ok(
    html.includes(
      'No repetiremos ninguna descarga ni eliminación automáticamente',
    ),
  );
  assert.ok(!html.includes('type="hidden"'));
});
test('legal links use canonical URLs and safe user-initiated external navigation', async () => {
  const html = await render('/settings');
  for (const name of ['privacy', 'terms', 'support'])
    assert.ok(html.includes(`href="https://ian-k.dev/stockapp/${name}/"`));
  assert.equal((html.match(/rel="noopener noreferrer"/g) ?? []).length, 3);
  assert.equal((html.match(/referrerPolicy="no-referrer"/g) ?? []).length, 3);
});
test('Privacy explains backup versus account export without encrypt/restore/sync promises', async () => {
  const html = await render('/settings/privacy');
  assert.ok(html.includes('JSON no está cifrado'));
  assert.ok(html.includes('información de tu cuenta'));
  assert.ok(html.includes('CSV/Excel'));
  assert.ok(html.includes('incluye solo la información de tu cuenta'));
  assert.ok(html.includes('No se ofrece importar ni restaurar'));
  assert.ok(html.includes('role="status"'));
});

for (const kind of [
  'LOADING_SESSION',
  'AUTHENTICATED_LOADING_ME',
  'ERROR',
  'LOGOUT_ERROR',
  'LOGGING_OUT',
  'ANONYMOUS',
] as const)
  test(`Account metadata retention ${kind} distinguishes transient refresh from failed/ended session`, () => {
    const previous = retainedAccountMetadata(
      { kind: 'BUSINESS_ACTIVE_ENABLED', generation: 7, me },
      null,
    );
    assert.ok(previous);
    const view: SessionView =
      kind === 'ERROR' || kind === 'LOGOUT_ERROR'
        ? { kind, generation: 7, message: 'sanitized' }
        : { kind, generation: 7 };
    const current = retainedAccountMetadata(view, previous);
    assert.equal(
      Boolean(current),
      kind === 'LOADING_SESSION' || kind === 'AUTHENTICATED_LOADING_ME',
    );
    assert.equal(
      retainedAccountMetadata({ ...view, generation: 8 }, previous),
      null,
    );
  });
test('known verification failure clears retained account identity before another loading transition', () => {
  const previous = retainedAccountMetadata(
    { kind: 'BUSINESS_ACTIVE_ENABLED', generation: 7, me },
    null,
  );
  const denied = retainedAccountMetadata(
    { kind: 'ERROR', generation: 7, message: 'Verify', verification: true },
    previous,
  );
  assert.equal(denied, null);
  assert.equal(
    retainedAccountMetadata({ kind: 'LOADING_SESSION', generation: 7 }, denied),
    null,
  );
});

for (const path of [
  '/settings',
  '/settings/privacy',
  '/settings/reauthenticate',
])
  test(`unverified ${path} cannot expose private metadata or sensitive actions`, async () => {
    const html = await render(path, {
      ...me,
      user: { ...me.user, emailVerified: false },
    });
    assert.ok(!html.includes('a@example.test'));
    assert.ok(!html.includes('Inventario A'));
    assert.ok(!html.includes('>Exportar mi cuenta</button>'));
    assert.ok(!html.includes('Solicitar eliminación'));
    assert.ok(!html.includes('type="password"'));
  });
