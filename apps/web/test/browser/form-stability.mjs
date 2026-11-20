// Run with the existing workspace tsx loader; Playwright is supplied by the QA environment.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { me } from '../session-fixtures.ts';
import { product, productId, strictResult } from '../product-fixtures.ts';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseURL = process.env.WEB_TEST_URL || 'http://127.0.0.1:5173';

async function harness(t) {
  const browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || 'msedge',
    headless: true,
  });
  t.after(() => browser.close());
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const state = {
    sessionCalls: 0,
    meCalls: 0,
    mode: 'ok',
    detail: product,
    writes: 0,
    documents: 0,
    detailCalls: 0,
  };
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.resourceType() === 'document')
      state.documents++;
  });
  await page.route('https://api.example.test/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/get-session') state.sessionCalls++;
    if (path === '/v1/me') state.meCalls++;
    if (state.mode === 'network') return route.abort('internetdisconnected');
    if (path === '/api/auth/get-session') {
      return route.fulfill({
        json:
          state.mode === 'expired'
            ? null
            : {
                user: me.user,
                session: {
                  id: 'session-a',
                  userId: me.user.id,
                  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
                },
              },
      });
    }
    if (path === '/api/auth/sign-out')
      return route.fulfill({ json: { success: true } });
    if (path === '/v1/me') return route.fulfill({ json: me });
    if (path === '/v1/session/csrf')
      return route.fulfill({ json: { token: 'test-csrf' } });
    if (route.request().method() === 'POST' && path.endsWith('/products')) {
      state.writes++;
      return route.fulfill({
        status: 200,
        json: strictResult(route.request().postDataJSON()),
      });
    }
    if (path.endsWith(`/products/${productId}`)) {
      state.detailCalls++;
      if (state.mode === 'detail-network')
        return route.abort('internetdisconnected');
      if (route.request().method() === 'PATCH') {
        const command = route.request().postDataJSON();
        state.writes++;
        state.detail = {
          ...product,
          product: {
            ...product.product,
            name: command.payload.name,
            variant: command.payload.variant,
            barcode: command.payload.barcode,
            regularSalePrice: command.payload.regularSalePrice,
            minimumStock: command.payload.minimumStock,
            metadataRevision: String(
              BigInt(command.preconditions.expectedMetadataRevision) + 1n,
            ),
          },
        };
        return route.fulfill({
          json: {
            product: state.detail.product,
            committedRevision: '1',
            serverRecordedAt: command.occurredAt,
          },
        });
      }
      return route.fulfill({ json: state.detail });
    }
    if (path.endsWith('/products'))
      return route.fulfill({ json: { items: [product], nextCursor: null } });
    throw new Error(
      `Unhandled fixture request: ${route.request().method()} ${path}`,
    );
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  return { page, state };
}

async function waitFor(check) {
  const deadline = Date.now() + 10_000;
  while (!check()) {
    if (Date.now() > deadline)
      throw new Error('Timed out waiting for completed fixture request');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

test('mobile viewport: five minutes, focus, reconnect and network errors keep the same typed input node', async (t) => {
  const { page, state } = await harness(t);
  await page.clock.install();
  await page.goto(`${baseURL}/products/new`);
  const input = page.getByRole('textbox', { name: 'Nombre', exact: true });
  await input.fill('Borrador UAT');
  const original = await input.elementHandle();
  assert.equal(
    await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }),
    true,
  );
  for (let minute = 1; minute <= 5; minute++) {
    const calls = state.meCalls;
    await page.clock.runFor(60_000);
    await waitFor(() => state.meCalls > calls);
    await page.waitForFunction(
      () =>
        document.querySelector('input[name="name"]')?.value === 'Borrador UAT',
    );
    assert.equal(await original.evaluate((node) => node.isConnected), true);
  }
  for (const event of ['focus', 'online']) {
    const calls = state.meCalls;
    await page.evaluate((type) => window.dispatchEvent(new Event(type)), event);
    await waitFor(() => state.meCalls > calls);
    assert.equal(await input.inputValue(), 'Borrador UAT');
  }
  state.mode = 'network';
  const calls = state.sessionCalls;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await waitFor(() => state.sessionCalls > calls);
  await page
    .getByRole('status')
    .filter({ hasText: 'No pudimos comprobar la sesión' })
    .waitFor();
  assert.equal(await input.inputValue(), 'Borrador UAT');
  assert.equal(await original.evaluate((node) => node.isConnected), true);
  state.mode = 'ok';
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForFunction(
    () => !document.body.textContent.includes('No pudimos comprobar la sesión'),
  );
  assert.equal(await input.inputValue(), 'Borrador UAT');
  assert.equal(state.documents, 1);
  assert.equal(
    await page.evaluate(
      async () => (await navigator.serviceWorker.getRegistrations()).length,
    ),
    0,
  );
});

test('mobile viewport: cancel navigation, confirm leaving, clean re-entry and accepted save', async (t) => {
  const { page, state } = await harness(t);
  await page.goto(`${baseURL}/products/new`);
  const input = page.getByRole('textbox', { name: 'Nombre', exact: true });
  await input.fill('Por guardar');
  const cancelledDialog = page.waitForEvent('dialog');
  const cancelledClick = page
    .getByRole('link', { name: 'Volver a productos' })
    .click();
  await (await cancelledDialog).dismiss();
  await cancelledClick;
  assert.equal(await input.inputValue(), 'Por guardar');
  const acceptedDialog = page.waitForEvent('dialog');
  const acceptedClick = page
    .getByRole('link', { name: 'Volver a productos' })
    .click();
  await (await acceptedDialog).accept();
  await acceptedClick;
  await page.waitForURL(`${baseURL}/products`);
  await page.goto(`${baseURL}/products/new`);
  assert.equal(await input.inputValue(), '');
  await input.fill('Guardado');
  await page
    .getByRole('textbox', { name: 'Precio habitual por unidad', exact: true })
    .fill('2.50');
  await page
    .getByRole('button', { name: 'Crear producto', exact: true })
    .click();
  await page.waitForURL(`${baseURL}/products`);
  assert.equal(state.writes, 1);
  await page.goto(`${baseURL}/products/new`);
  assert.equal(await input.inputValue(), '');
});

test('mobile viewport: edited Product survives detail refetch failure and retry', async (t) => {
  const { page, state } = await harness(t);
  await page.goto(`${baseURL}/products/${productId}/edit`);
  const input = page.getByRole('textbox', { name: 'Nombre', exact: true });
  await input.fill('Edición local');
  const original = await input.elementHandle();
  state.mode = 'detail-network';
  // Emulate the visibility events Query uses when a mobile tab resumes.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
  });
  await page
    .getByRole('alert')
    .filter({ hasText: 'No pudimos actualizar el producto' })
    .waitFor();
  assert.equal(await input.inputValue(), 'Edición local');
  assert.equal(await original.evaluate((node) => node.isConnected), true);
  state.mode = 'ok';
  await page
    .getByRole('button', { name: 'Reintentar consulta', exact: true })
    .click();
  await page.waitForFunction(
    () =>
      !document.body.textContent.includes('No pudimos actualizar el producto'),
  );
  assert.equal(await input.inputValue(), 'Edición local');
  const calls = state.detailCalls;
  state.detail = {
    ...product,
    product: {
      ...product.product,
      name: 'Versión del servidor',
      metadataRevision: '1',
    },
  };
  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
  });
  await waitFor(() => state.detailCalls > calls);
  assert.equal(await input.inputValue(), 'Edición local');
});

for (const scenario of [
  { path: '/purchases/new', field: 'Cantidad', value: '7' },
  {
    path: '/adjustments/new',
    field: '¿Cuántas tienes realmente?',
    value: '11',
  },
  {
    path: '/sales/new',
    field: 'Precio de venta por unidad (EUR)',
    value: '2.345678',
  },
]) {
  test(`mobile viewport: ${scenario.path} retains its draft across revalidation and prevents accidental leaving`, async (t) => {
    const { page, state } = await harness(t);
    await page.goto(`${baseURL}${scenario.path}`);
    await page
      .getByRole('button', {
        name: scenario.path === '/sales/new' ? 'Agregar' : 'Seleccionar',
        exact: true,
      })
      .click();
    const field = page.getByRole('textbox', {
      name: scenario.field,
      exact: true,
    });
    await field.fill(scenario.value);
    const original = await field.elementHandle();
    const calls = state.meCalls;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await waitFor(() => state.meCalls > calls);
    assert.equal(await field.inputValue(), scenario.value);
    assert.equal(await original.evaluate((node) => node.isConnected), true);
    assert.deepEqual(
      await page.evaluate(() => ({
        local: { ...localStorage },
        session: { ...sessionStorage },
      })),
      { local: {}, session: {} },
    );
    const dialog = page.waitForEvent('dialog');
    const click = page
      .getByRole('link', { name: 'Productos', exact: true })
      .click();
    await (await dialog).dismiss();
    await click;
    assert.equal(await field.inputValue(), scenario.value);
  });
}

test('mobile viewport: revoked session and logout bypass the dirty guard and discard private state', async (t) => {
  const { page, state } = await harness(t);
  await page.goto(`${baseURL}/products/new`);
  await page
    .getByRole('textbox', { name: 'Nombre', exact: true })
    .fill('Privado');
  state.mode = 'expired';
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForURL(`${baseURL}/login`);
  assert.equal(
    await page.getByRole('textbox', { name: 'Nombre', exact: true }).count(),
    0,
  );
  state.mode = 'ok';
  await page.goto(`${baseURL}/products/new`);
  assert.equal(
    await page
      .getByRole('textbox', { name: 'Nombre', exact: true })
      .inputValue(),
    '',
  );
  await page
    .getByRole('textbox', { name: 'Nombre', exact: true })
    .fill('Privado otra vez');
  await page
    .getByRole('button', { name: 'Cerrar sesión', exact: true })
    .click();
  await page.waitForURL(`${baseURL}/login`);
  assert.deepEqual(
    await page.evaluate(() => ({
      local: { ...localStorage },
      session: { ...sessionStorage },
    })),
    { local: {}, session: {} },
  );
});

test('mobile viewport: browser Back can be cancelled and then confirmed without a document reload', async (t) => {
  const { page, state } = await harness(t);
  await page.goto(`${baseURL}/products`);
  await page.getByRole('link', { name: 'Crear producto', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Nombre', exact: true });
  await input.fill('Conservar al volver');
  const cancelled = page.waitForEvent('dialog');
  await page.evaluate(() => history.back());
  await (await cancelled).dismiss();
  await page.waitForURL(`${baseURL}/products/new`);
  assert.equal(await input.inputValue(), 'Conservar al volver');
  const accepted = page.waitForEvent('dialog');
  await page.evaluate(() => history.back());
  await (await accepted).accept();
  await page.waitForURL(`${baseURL}/products`);
  assert.equal(state.documents, 1);
});

test('mobile viewport: accepted Product edit navigates without a dirty prompt and reopens the saved value', async (t) => {
  const { page, state } = await harness(t);
  await page.goto(`${baseURL}/products/${productId}/edit`);
  await page
    .getByRole('textbox', { name: 'Nombre', exact: true })
    .fill('Cambio aceptado');
  await page
    .getByRole('button', { name: 'Guardar cambios', exact: true })
    .click();
  await page.waitForURL(`${baseURL}/products/${productId}`);
  assert.equal(state.writes, 1);
  assert.equal(
    await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }),
    false,
  );
  await page
    .getByRole('link', { name: 'Editar producto', exact: true })
    .click();
  assert.equal(
    await page
      .getByRole('textbox', { name: 'Nombre', exact: true })
      .inputValue(),
    'Cambio aceptado',
  );
});
