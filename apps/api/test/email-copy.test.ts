import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verificationEmailText } from '../src/auth/email-copy.js';

test('verification instructions preserve the official URL and explain expiry, sign-in and resend', () => {
  const url =
    'https://api.example.test/api/auth/verify-email?token=synthetic&callbackURL=https%3A%2F%2Fweb.example.test%2Fverify-email%3Fverified%3D1';
  const text = verificationEmailText(
    url,
    24 * 3600,
    'https://web.example.test',
  );
  assert.equal(text.match(/https?:\/\/\S+/)?.[0], url);
  assert.equal(text.split(url).length, 2);
  assert.ok(text.includes('24 horas'));
  assert.ok(text.includes('no inicia sesión automáticamente'));
  assert.ok(text.includes('https://web.example.test/verify-email'));
  assert.ok(text.includes('Si no creaste esta cuenta'));
  assert.ok(text.includes('nunca te pedirá enviar tu contraseña'));
  assert.ok(!text.includes('stockapp-staging.ian-k.dev'));
});

test('email duration and resend origin come from the configured runtime', () => {
  const text = verificationEmailText(
    'http://127.0.0.1:43184/verify',
    12 * 3600,
    'http://127.0.0.1:43183',
  );
  assert.ok(text.includes('12 horas'));
  assert.ok(text.includes('http://127.0.0.1:43183/verify-email'));
});
