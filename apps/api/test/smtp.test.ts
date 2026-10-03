import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localSmtp } from './helpers/smtp.js';
import { createSmtpSender, readSmtpConfig } from '../src/auth/email.js';

test('SMTP adapter delivers plain text to an ephemeral local server and closes resources', async (t) => {
  const smtp = await localSmtp(t);
  await smtp.sender.send({
    to: 'recipient@example.test',
    subject: 'Fictional verification',
    text: 'Verify via https://example.test/verify?token=fictional-token',
  });
  assert.deepEqual(smtp.recipients, ['recipient@example.test']);
  assert.equal(smtp.messages.length, 1);
  assert.match(smtp.messages[0], /Content-Type: text\/plain/);
  assert.match(smtp.messages[0], /fictional-token/);
  assert.doesNotMatch(smtp.messages[0], /Content-Type: text\/html/);
});

test('required STARTTLS refuses a relay that offers only plaintext without delivering email', async (t) => {
  const smtp = await localSmtp(t);
  const sender = createSmtpSender(
    readSmtpConfig({
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(smtp.port),
      SMTP_SECURITY: 'starttls',
      SMTP_FROM: 'auth@example.test',
    }),
  );
  t.after(() => sender.close());
  await assert.rejects(
    sender.send({
      to: 'recipient@example.test',
      subject: 'Fictional',
      text: 'Must not be delivered in plaintext.',
    }),
  );
  assert.equal(smtp.messages.length, 0);
  assert.equal(smtp.recipients.length, 0);
});
