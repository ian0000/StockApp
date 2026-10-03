import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readAuthConfig } from '../src/auth/config.js';
import { readSmtpConfig } from '../src/auth/email.js';

const fictional = {
  BETTER_AUTH_SECRET: 'fictional-auth-config-test-only-secret',
  AUTH_BASE_URL: 'http://127.0.0.1:3001',
  APP_ORIGIN: 'http://localhost:5173',
};

test('auth config requires explicit secrets and exact safe origins without global origin magic', () => {
  const config = readAuthConfig(fictional);
  assert.equal(config.verificationExpiresIn, 86400);
  assert.equal(config.resetExpiresIn, 1800);
  assert.equal(config.secureCookies, false);
  assert.throws(() =>
    readAuthConfig({ ...fictional, BETTER_AUTH_SECRET: undefined }),
  );
  assert.throws(() =>
    readAuthConfig({ ...fictional, BETTER_AUTH_SECRET: 'short' }),
  );
  for (const origin of [
    '*',
    'https://*.pages.dev',
    'https://user:pass@example.test',
    'https://example.test/path',
    'https://example.test?token=fake',
    'http://example.test',
    'inventory-app://',
  ]) {
    assert.throws(() => readAuthConfig({ ...fictional, APP_ORIGIN: origin }));
  }
  assert.throws(() => readAuthConfig({ ...fictional, NODE_ENV: 'production' }));
  assert.throws(() =>
    readAuthConfig({ ...fictional, BETTER_AUTH_TRUSTED_ORIGINS: '*' }),
  );
  const production = readAuthConfig({
    ...fictional,
    NODE_ENV: 'production',
    AUTH_BASE_URL: 'https://api.example.test',
    APP_ORIGIN: 'https://app.example.test',
  });
  assert.equal(production.secureCookies, true);
});

test('SMTP security is explicit, requires paired credentials and permits plaintext only locally', () => {
  const env = {
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: '2525',
    SMTP_SECURITY: 'local',
    SMTP_FROM: 'auth@example.test',
  };
  assert.equal(readSmtpConfig(env).security, 'local');
  for (const change of [
    { SMTP_PORT: '0' },
    { SMTP_PORT: '65536' },
    { SMTP_PORT: 'abc' },
    { SMTP_SECURITY: undefined },
    { SMTP_HOST: 'smtp.example.test' },
    { NODE_ENV: 'production' },
    { SMTP_USER: 'fictional-user' },
    { SMTP_FROM: 'auth@example.test\r\nBcc: other@example.test' },
  ]) {
    assert.throws(() => readSmtpConfig({ ...env, ...change }));
  }
  for (const security of ['tls', 'starttls']) {
    const config = readSmtpConfig({
      ...env,
      SMTP_HOST: 'smtp.example.test',
      SMTP_SECURITY: security,
      NODE_ENV: 'production',
      SMTP_USER: 'fictional-user',
      SMTP_PASSWORD: 'fictional-smtp-password',
    });
    assert.equal(config.security, security);
    assert.equal(config.auth?.user, 'fictional-user');
  }
});
