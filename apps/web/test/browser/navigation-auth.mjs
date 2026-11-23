// Explicit browser QA: run with tsx and Playwright supplied by the QA environment.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { me } from '../session-fixtures.ts';
import { product } from '../product-fixtures.ts';
import { emptyDashboard } from '../read-fixtures.ts';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseURL = process.env.WEB_TEST_URL || 'http://127.0.0.1:5173';

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function harness(t, authenticated = false) {
  const browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || 'msedge',
    headless: true,
  });
  t.after(() => browser.close());
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const state = {
    documents: 0,
    resendStatus: 200,
    signups: [],
    signins: [],
    resets: [],
  };
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.resourceType() === 'document')
      state.documents++;
  });
  t.after(() => assert.deepEqual(errors, []));
  await page.route('https://api.example.test/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === '/api/auth/get-session')
      return route.fulfill({
        json: authenticated
          ? {
              user: me.user,
              session: {
                id: 'session-navigation',
                userId: me.user.id,
                expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
              },
            }
          : null,
      });
    if (path === '/api/auth/sign-in/email') {
      state.signins.push(request.postDataJSON());
      return route.fulfill({
        status: 401,
        json: {
          code: 'INVALID_EMAIL_OR_PASSWORD',
          message: 'Private fixture details',
        },
      });
    }
    if (path === '/api/auth/sign-up/email') {
      state.signups.push(request.postDataJSON());
      return route.fulfill({
        json: {
          token: null,
          user: { id: 'synthetic-public-user', emailVerified: false },
        },
      });
    }
    if (path === '/api/auth/verify-email') {
      const valid = url.searchParams.get('token') === 'valid-fixture';
      const callbackURL = url.searchParams.get('callbackURL');
      if (callbackURL) {
        const callback = new URL(callbackURL);
        assert.equal(callback.origin, new URL(baseURL).origin);
        if (!valid) callback.searchParams.set('error', 'TOKEN_EXPIRED');
        return route.fulfill({
          status: 302,
          headers: { location: callback.href },
        });
      }
      return route.fulfill({
        status: valid ? 200 : 401,
        json: valid ? { status: true, user: null } : { code: 'TOKEN_EXPIRED' },
      });
    }
    if (path === '/api/auth/send-verification-email')
      return route.fulfill({
        status: state.resendStatus,
        json:
          state.resendStatus === 200
            ? { status: true }
            : {
                code: 'PRIVATE_PROVIDER_ERROR',
                message: 'Do not expose recipient or provider details',
              },
      });
    if (path === '/api/auth/request-password-reset') {
      state.resets.push(request.postDataJSON());
      return route.fulfill({
        json: {
          status: true,
          message: 'If the email exists, check your email',
        },
      });
    }
    if (path === '/v1/me') return route.fulfill({ json: me });
    if (path.endsWith('/products'))
      return route.fulfill({ json: { items: [product], nextCursor: null } });
    if (path.endsWith('/history'))
      return route.fulfill({ json: { items: [], nextCursor: null } });
    if (path.endsWith('/dashboard'))
      return route.fulfill({ json: emptyDashboard });
    throw new Error(
      `Unhandled navigation fixture: ${request.method()} ${path}`,
    );
  });
  return { page, state };
}

test('mobile viewport: a valid verification link opens login and an expired one offers resend', async (t) => {
  const { page, state } = await harness(t);
  const emailLink = new URL('https://api.example.test/api/auth/verify-email');
  emailLink.searchParams.set(
    'callbackURL',
    `${baseURL}/verify-email?verified=1`,
  );
  const login = page.getByRole('heading', {
    name: 'Iniciar sesión',
    exact: true,
  });
  const confirmation = page
    .getByRole('status')
    .filter({ hasText: 'Correo verificado. Ya puedes iniciar sesión.' });
  const resend = page.getByRole('button', { name: 'Reenviar verificación' });
  const failure = page
    .getByRole('status')
    .filter({ hasText: 'El enlace no pudo verificarse.' });

  emailLink.searchParams.set('token', 'valid-fixture');
  await page.goto(emailLink.href);
  await page.waitForURL(`${baseURL}/login`);
  await login.waitFor();
  await confirmation.waitFor();
  assert.equal(await resend.count(), 0);

  emailLink.searchParams.set('token', 'expired-fixture');
  await page.goto(emailLink.href);
  await page.waitForURL(`${baseURL}/verify-email`);
  await failure.waitFor();
  await resend.waitFor();
  assert.equal(await confirmation.count(), 0);

  await page.goto(`${baseURL}/verify-email?token=expired-fixture&verified=1`);
  await page.waitForURL(`${baseURL}/verify-email`);
  await failure.waitFor();
  await resend.waitFor();
  assert.equal(await confirmation.count(), 0);

  await page.goto(`${baseURL}/verify-email?token=valid-fixture`);
  await page.waitForURL(`${baseURL}/login`);
  await confirmation.waitFor();
  assert.equal(state.signins.length, 0);
});

test('mobile viewport: public auth links navigate in one document and preserve the running app', async (t) => {
  const { page, state } = await harness(t);
  await page.goto(baseURL);
  await page
    .getByRole('link', { name: 'Iniciar sesión', exact: true })
    .first()
    .click();
  await page.waitForURL(`${baseURL}/login`);
  const root = await page.locator('#root').elementHandle();
  await page.getByRole('link', { name: 'Crear cuenta', exact: true }).click();
  const signupActions = page.getByRole('navigation', {
    name: 'Opciones de acceso',
  });
  for (const [label, path] of [
    ['Iniciar sesión', '/login'],
    ['Recuperar contraseña', '/reset-password'],
    ['Solicitar verificación', '/verify-email'],
  ]) {
    assert.equal(
      await signupActions
        .getByRole('link', { name: label, exact: true })
        .getAttribute('href'),
      path,
    );
  }
  await page.waitForURL(`${baseURL}/signup`);
  await page.getByRole('link', { name: 'Iniciar sesión', exact: true }).click();
  await page
    .getByRole('link', { name: 'Olvidé mi contraseña', exact: true })
    .click();
  await page.waitForURL(`${baseURL}/reset-password`);
  await page
    .getByRole('link', { name: 'Volver a iniciar sesión', exact: true })
    .click();
  await page
    .getByRole('link', { name: 'Verificar correo', exact: true })
    .click();
  await page.waitForURL(`${baseURL}/verify-email`);
  assert.equal(await root.evaluate((node) => node.isConnected), true);
  assert.equal(state.documents, 1);
});

test('mobile viewport: delayed lazy navigation preserves the private shell and makes no document request', async (t) => {
  const { page, state } = await harness(t, true);
  const requested = deferred();
  const release = deferred();
  t.after(() => release.resolve());
  await page.route(
    /\/(?:assets\/history-[^/]+\.js|src\/routes\/history\.tsx)(?:\?.*)?$/,
    async (route) => {
      requested.resolve();
      await release.promise;
      await route.continue();
    },
  );
  await page.goto(`${baseURL}/products`);
  await page.getByRole('heading', { name: 'Productos', exact: true }).waitFor();
  const shell = await page.locator('.app-shell').elementHandle();
  const sidebar = await page
    .getByRole('navigation', { name: 'Navegación principal', exact: true })
    .elementHandle();
  const click = page
    .getByRole('link', { name: 'Historial', exact: true })
    .click();
  await requested.promise;
  await page
    .getByRole('status')
    .filter({ hasText: 'Cargando pantalla' })
    .waitFor();
  assert.equal(await shell.evaluate((node) => node.isConnected), true);
  assert.equal(await sidebar.evaluate((node) => node.isConnected), true);
  assert.equal(
    await page.getByRole('heading', { name: 'Productos', exact: true }).count(),
    1,
  );
  release.resolve();
  await click;
  await page.waitForURL(`${baseURL}/history`);
  await page.getByRole('heading', { name: 'Historial', exact: true }).waitFor();
  assert.equal(await shell.evaluate((node) => node.isConnected), true);
  assert.equal(state.documents, 1);
});

test('mobile viewport: failed login, generic signup/resend and recovery have useful safe feedback', async (t) => {
  const { page, state } = await harness(t);
  await page.goto(`${baseURL}/login`);
  await page
    .getByRole('textbox', { name: 'Correo', exact: true })
    .fill('existing@example.test');
  await page
    .getByLabel('Contraseña', { exact: true })
    .fill('synthetic-wrong-password');
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  await page
    .getByRole('status')
    .filter({ hasText: 'Revisa el correo y la contraseña' })
    .waitFor();
  assert.equal(state.signins.length, 1);
  assert.equal(
    await page.getByLabel('Contraseña', { exact: true }).inputValue(),
    '',
  );
  await page.getByRole('link', { name: 'Crear cuenta', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Nombre', exact: true })
    .fill('Cuenta de prueba');
  await page
    .getByRole('textbox', { name: 'Correo', exact: true })
    .fill('existing@example.test');
  await page
    .getByLabel('Contraseña', { exact: true })
    .fill('synthetic-new-password');
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  await page.waitForURL(`${baseURL}/verify-email`);
  await page
    .getByRole('status')
    .filter({ hasText: 'Solicitud aceptada' })
    .waitFor();
  assert.equal(state.signups.length, 1);
  for (const email of [
    'existing@example.test',
    'verified@example.test',
    'missing@example.test',
  ]) {
    await page
      .getByRole('textbox', { name: 'Correo', exact: true })
      .fill(email);
    await page
      .getByRole('button', { name: 'Reenviar verificación', exact: true })
      .click();
    await page
      .locator('#form-message')
      .filter({ hasText: 'no confirma que el correo haya llegado' })
      .waitFor();
  }
  state.resendStatus = 500;
  await page
    .getByRole('button', { name: 'Reenviar verificación', exact: true })
    .click();
  await page
    .locator('#form-message')
    .filter({ hasText: 'No pudimos completar la solicitud' })
    .waitFor();
  state.resendStatus = 429;
  await page
    .getByRole('button', { name: 'Reenviar verificación', exact: true })
    .click();
  await page
    .locator('#form-message')
    .filter({ hasText: 'Espera unos minutos' })
    .waitFor();
  await page
    .getByRole('link', { name: 'solicita restablecerla', exact: true })
    .click();
  await page.waitForURL(`${baseURL}/reset-password`);
  await page
    .getByRole('textbox', { name: 'Correo', exact: true })
    .fill('existing@example.test');
  await page
    .getByRole('button', { name: 'Solicitar enlace', exact: true })
    .click();
  await page
    .getByRole('status')
    .filter({ hasText: 'Si el correo corresponde a una cuenta' })
    .waitFor();
  assert.equal(state.resets.length, 1);
  assert.equal(state.documents, 1);
  assert.equal(
    (await page.locator('body').innerText()).includes('PRIVATE_PROVIDER_ERROR'),
    false,
  );
  assert.deepEqual(
    await page.evaluate(() => ({
      local: { ...localStorage },
      session: { ...sessionStorage },
    })),
    { local: {}, session: {} },
  );
});
