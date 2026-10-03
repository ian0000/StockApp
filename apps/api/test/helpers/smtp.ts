import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { SMTPServer } from 'smtp-server';
import { createSmtpSender, readSmtpConfig } from '../../src/auth/email.js';

export async function localSmtp(t: TestContext) {
  const messages: string[] = [];
  const recipients: string[] = [];
  const server = new SMTPServer({
    secure: false,
    authOptional: true,
    disabledCommands: ['AUTH', 'STARTTLS'],
    logger: false,
    onRcptTo(address, _session, callback) {
      recipients.push(address.address);
      callback();
    },
    onData(stream, _session, callback) {
      let content = '';
      stream.setEncoding('utf8');
      stream.on('data', (chunk: string) => {
        content += chunk;
      });
      stream.on('end', () => {
        messages.push(content);
        callback();
      });
      stream.on('error', () => callback(new Error('Local SMTP read failed.')));
    },
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise<void>((resolve) => server.close(resolve)));
  const address = server.server.address();
  assert.ok(address && typeof address !== 'string');
  const sender = createSmtpSender(
    readSmtpConfig({
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(address.port),
      SMTP_SECURITY: 'local',
      SMTP_FROM: 'auth@example.test',
    }),
  );
  t.after(() => sender.close());
  return { sender, messages, recipients, port: address.port };
}
