import {
  createSmtpSender,
  readSmtpConfig,
  type AuthEmail,
  type SmtpConfig,
} from './email.js';

type EmailConfig =
  | { transport: 'smtp'; smtp: SmtpConfig }
  | { transport: 'resend'; apiKey: string; from: string };

export function readEmailConfig(
  env: Readonly<Record<string, string | undefined>>,
): EmailConfig {
  const transport = env.AUTH_EMAIL_TRANSPORT ?? 'smtp';
  if (transport === 'smtp') return { transport, smtp: readSmtpConfig(env) };
  if (transport !== 'resend') throw new Error('Invalid auth email transport.');
  const apiKey = env.RESEND_API_KEY;
  const from = env.AUTH_EMAIL_FROM;
  if (
    !apiKey ||
    !/^[\x21-\x7e]+$/.test(apiKey) ||
    !from ||
    !/^[^\s<>@]+@[^\s<>@]+$/.test(from)
  )
    throw new Error('Resend configuration is incomplete or invalid.');
  return { transport, apiKey, from };
}

export function createEmailSender(
  config: EmailConfig,
  fetcher: typeof fetch = globalThis.fetch,
) {
  if (config.transport === 'smtp') return createSmtpSender(config.smtp);
  const lifetime = new AbortController();
  return {
    async send(email: AuthEmail): Promise<void> {
      try {
        lifetime.signal.throwIfAborted();
        const response = await fetcher('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            'content-type': 'application/json',
            accept: 'application/json',
            'cache-control': 'no-store',
          },
          body: JSON.stringify({
            from: config.from,
            to: [email.to],
            subject: email.subject,
            text: email.text,
          }),
          // Auth links and credentials must never follow a provider redirect.
          redirect: 'error',
          credentials: 'omit',
          signal: AbortSignal.any([
            lifetime.signal,
            AbortSignal.timeout(10_000),
          ]),
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error();
        }
        const result: unknown = await response.json();
        if (
          !result ||
          typeof result !== 'object' ||
          Array.isArray(result) ||
          !('id' in result) ||
          typeof result.id !== 'string' ||
          !result.id.trim()
        )
          throw new Error();
        // Provider acceptance is not evidence of delivery to the tester's inbox.
      } catch {
        throw new Error('Could not deliver authentication email.');
      }
    },
    close(): void {
      lifetime.abort();
    },
  };
}
