import {
  createSmtpSender,
  readSmtpConfig,
  type AuthEmail,
  type SmtpConfig,
} from './email.js';

type EmailConfig =
  | { transport: 'smtp'; smtp: SmtpConfig }
  | { transport: 'resend'; apiKey: string; from: string };

export type EmailDeliveryEvent = {
  transport: 'smtp' | 'resend';
  outcome: 'accepted' | 'failed';
  providerStatus?: number;
  providerMessageId?: string;
};

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
  onDelivery?: (event: EmailDeliveryEvent) => void,
) {
  function report(event: EmailDeliveryEvent) {
    try {
      onDelivery?.(event);
    } catch {
      // An observability failure must not change delivery or trigger a second send.
    }
  }
  if (config.transport === 'smtp') {
    const sender = createSmtpSender(config.smtp);
    return {
      async send(email: AuthEmail): Promise<void> {
        try {
          await sender.send(email);
          report({ transport: 'smtp', outcome: 'accepted' });
        } catch (error) {
          report({ transport: 'smtp', outcome: 'failed' });
          throw error;
        }
      },
      close: () => sender.close(),
    };
  }
  const lifetime = new AbortController();
  return {
    async send(email: AuthEmail): Promise<void> {
      let providerStatus: number | undefined;
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
        providerStatus = response.status;
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
        report({
          transport: 'resend',
          outcome: 'accepted',
          providerStatus,
          // Never log an arbitrary provider string that could contain message content or PII.
          ...(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
            result.id,
          )
            ? { providerMessageId: result.id }
            : {}),
        });
      } catch {
        report({
          transport: 'resend',
          outcome: 'failed',
          ...(providerStatus === undefined ? {} : { providerStatus }),
        });
        throw new Error('Could not deliver authentication email.');
      }
    },
    close(): void {
      lifetime.abort();
    },
  };
}
