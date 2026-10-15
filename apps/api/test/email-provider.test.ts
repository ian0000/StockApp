import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createEmailSender,
  readEmailConfig,
} from '../src/auth/email-provider.js';

const smtp = {
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: '2525',
  SMTP_SECURITY: 'local',
  SMTP_FROM: 'auth@example.test',
};
const resend = {
  AUTH_EMAIL_TRANSPORT: 'resend',
  AUTH_EMAIL_FROM: 'uat@example.test',
  RESEND_API_KEY: 'fictional-resend-test-only-key',
};
const message = {
  to: 'tester@example.test',
  subject: 'Verifica tu correo',
  text: 'Fictional verification link: https://app.example.test/verify?token=fictional',
};
const deliveryError = { message: 'Could not deliver authentication email.' };

test('SMTP remains the default and Resend selection fails closed without its own configuration', () => {
  assert.equal(readEmailConfig(smtp).transport, 'smtp');
  assert.equal(
    readEmailConfig({ ...smtp, AUTH_EMAIL_TRANSPORT: 'smtp' }).transport,
    'smtp',
  );
  const sender = createEmailSender(readEmailConfig(smtp));
  sender.close();
  assert.equal(readEmailConfig(resend).transport, 'resend');
  for (const change of [
    { AUTH_EMAIL_TRANSPORT: 'unknown' },
    { AUTH_EMAIL_TRANSPORT: '' },
    { AUTH_EMAIL_FROM: undefined },
    { AUTH_EMAIL_FROM: 'name <uat@example.test>' },
    { AUTH_EMAIL_FROM: 'uat@example.test\r\nBcc: other@example.test' },
    { RESEND_API_KEY: undefined },
    { RESEND_API_KEY: ' ' },
    { RESEND_API_KEY: 'fictional\r\nkey' },
  ]) {
    assert.throws(() => readEmailConfig({ ...smtp, ...resend, ...change }));
  }
  assert.throws(() =>
    readEmailConfig({ ...resend, AUTH_EMAIL_TRANSPORT: undefined }),
  );
});

test('Resend sends the exact auth message once over fixed HTTPS with credential isolation', async () => {
  let calls = 0;
  const sender = createEmailSender(
    readEmailConfig(resend),
    async (url, init) => {
      calls++;
      assert.equal(url, 'https://api.resend.com/emails');
      assert.equal(init?.method, 'POST');
      assert.equal(init?.redirect, 'error');
      assert.equal(init?.credentials, 'omit');
      assert.ok(init?.signal instanceof AbortSignal);
      assert.equal(init.signal.aborted, false);
      const headers = new Headers(init.headers);
      assert.equal(
        headers.get('authorization'),
        `Bearer ${resend.RESEND_API_KEY}`,
      );
      assert.equal(headers.get('content-type'), 'application/json');
      assert.equal(headers.get('cache-control'), 'no-store');
      assert.deepEqual(JSON.parse(String(init.body)), {
        from: resend.AUTH_EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      });
      return Response.json({ id: 'fictional-provider-message-id' });
    },
  );
  try {
    await sender.send(message);
    assert.equal(calls, 1);
  } finally {
    sender.close();
  }
});

for (const status of [301, 401, 403, 429, 500]) {
  test(`Resend ${status} is sanitized and never retried`, async () => {
    let calls = 0;
    const sender = createEmailSender(readEmailConfig(resend), async () => {
      calls++;
      return Response.json(
        { error: `${resend.RESEND_API_KEY} ${message.to} ${message.text}` },
        { status },
      );
    });
    try {
      await assert.rejects(sender.send(message), deliveryError);
      assert.equal(calls, 1);
    } finally {
      sender.close();
    }
  });
}

for (const payload of [null, [], {}, { id: '' }, { id: 1 }]) {
  test(`Resend malformed success ${JSON.stringify(payload)} is rejected`, async () => {
    const sender = createEmailSender(readEmailConfig(resend), async () =>
      Response.json(payload),
    );
    try {
      await assert.rejects(sender.send(message), deliveryError);
    } finally {
      sender.close();
    }
  });
}

test('network and non-JSON provider failures never expose messages or credentials', async () => {
  for (const fetcher of [
    async () => {
      throw new Error(`${resend.RESEND_API_KEY} ${message.text}`);
    },
    async () => new Response('not-json'),
  ]) {
    const sender = createEmailSender(readEmailConfig(resend), fetcher);
    try {
      await assert.rejects(sender.send(message), deliveryError);
    } finally {
      sender.close();
    }
  }
});

test('closing the Resend sender cancels its request and prevents new sends', async () => {
  let calls = 0;
  let entered: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const sender = createEmailSender(
    readEmailConfig(resend),
    async (_url, init) => {
      calls++;
      assert.ok(init?.signal);
      entered?.();
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener(
          'abort',
          () => reject(new Error('aborted')),
          { once: true },
        );
      });
    },
  );
  const pending = assert.rejects(sender.send(message), deliveryError);
  await started;
  sender.close();
  await pending;
  await assert.rejects(sender.send(message), deliveryError);
  assert.equal(calls, 1);
});

test('Resend propagates its bounded deadline as an abort, with no retry', async (t) => {
  t.mock.method(AbortSignal, 'timeout', (milliseconds: number) => {
    assert.equal(milliseconds, 10_000);
    return AbortSignal.abort();
  });
  let calls = 0;
  const sender = createEmailSender(
    readEmailConfig(resend),
    async (_url, init) => {
      calls++;
      assert.ok(init?.signal);
      init.signal.throwIfAborted();
      throw new Error('Expected an aborted signal.');
    },
  );
  try {
    await assert.rejects(sender.send(message), deliveryError);
    assert.equal(calls, 1);
  } finally {
    sender.close();
  }
});
