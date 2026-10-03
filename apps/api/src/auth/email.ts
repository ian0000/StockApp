import nodemailer from 'nodemailer';
import { isLoopback } from './config.js';

export interface AuthEmail {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  send(email: AuthEmail): Promise<void>;
}

export interface SmtpConfig {
  host: string;
  port: number;
  security: 'tls' | 'starttls' | 'local';
  from: string;
  auth?: { user: string; pass: string };
}

export function readSmtpConfig(
  env: Readonly<Record<string, string | undefined>>,
): SmtpConfig {
  const host = env.SMTP_HOST;
  const portText = env.SMTP_PORT;
  const port = Number(portText);
  const security = env.SMTP_SECURITY;
  const from = env.SMTP_FROM;
  if (
    !host ||
    /[\s/:@]/.test(host) ||
    !portText ||
    !/^\d+$/.test(portText) ||
    port < 1 ||
    port > 65535 ||
    !['tls', 'starttls', 'local'].includes(security ?? '') ||
    !from ||
    !/^[^\s<>@]+@[^\s<>@]+$/.test(from) ||
    Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD)
  )
    throw new Error('SMTP configuration is incomplete or invalid.');
  if (
    security === 'local' &&
    (env.NODE_ENV === 'production' || !isLoopback(host))
  ) {
    throw new Error('Plaintext SMTP is restricted to local tests/development.');
  }
  if (security !== 'tls' && security !== 'starttls' && security !== 'local') {
    throw new Error('SMTP security mode is invalid.');
  }
  return {
    host,
    port,
    security,
    from,
    ...(env.SMTP_USER && env.SMTP_PASSWORD
      ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } }
      : {}),
  };
}

export function createSmtpSender(config: SmtpConfig) {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.security === 'tls',
    requireTLS: config.security === 'starttls',
    ignoreTLS: config.security === 'local',
    auth: config.auth,
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return {
    async send(email: AuthEmail): Promise<void> {
      await transport.sendMail({ from: config.from, ...email });
    },
    close(): void {
      transport.close();
    },
  };
}
