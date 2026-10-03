import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LEGAL_SUPPORT_LINKS,
  PRIVACY_URL,
  TERMS_URL,
  SUPPORT_URL,
  openLegalSupportLink,
} from '../src/ui/more/legal-support-links';

const EXPECTED_LINKS = [
  {
    label: 'Política de privacidad',
    url: 'https://ian-k.dev/stockapp/privacy/',
  },
  { label: 'Términos de uso', url: 'https://ian-k.dev/stockapp/terms/' },
  { label: 'Soporte', url: 'https://ian-k.dev/stockapp/support/' },
];

test('legal and support actions use the approved canonical production URLs', () => {
  assert.deepEqual(LEGAL_SUPPORT_LINKS, EXPECTED_LINKS);
  assert.deepEqual(
    [PRIVACY_URL, TERMS_URL, SUPPORT_URL],
    EXPECTED_LINKS.map((link) => link.url),
  );
});

for (const expected of EXPECTED_LINKS) {
  test(`${expected.label} opens its canonical URL without error feedback`, async () => {
    const link = LEGAL_SUPPORT_LINKS.find(
      (item) => item.label === expected.label,
    );
    assert.ok(link);
    const opened: string[] = [];
    await openLegalSupportLink(link.url, {
      async openURL(url) {
        opened.push(url);
      },
      showError() {
        assert.fail('Successful opening must not show an error.');
      },
    });
    assert.deepEqual(opened, [expected.url]);
  });
}

test('an opening rejection is handled with user feedback and no rejected handler promise', async () => {
  const alerts: { title: string; message: string }[] = [];
  await assert.doesNotReject(
    openLegalSupportLink(PRIVACY_URL, {
      async openURL() {
        throw new Error('Native URL handler failed.');
      },
      showError(title, message) {
        alerts.push({ title, message });
      },
    }),
  );
  assert.deepEqual(alerts, [
    {
      title: 'No se pudo abrir el enlace.',
      message: 'Inténtalo nuevamente.',
    },
  ]);
});

test('a synchronous platform failure is also handled', async () => {
  let alerts = 0;
  await assert.doesNotReject(
    openLegalSupportLink(SUPPORT_URL, {
      openURL() {
        throw new Error('Native handler unavailable.');
      },
      showError() {
        alerts += 1;
      },
    }),
  );
  assert.equal(alerts, 1);
});
