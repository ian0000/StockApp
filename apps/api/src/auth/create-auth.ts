import { betterAuth } from 'better-auth';
import { APIError, isAPIError } from 'better-auth/api';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { expo } from '@better-auth/expo';
import type { createDatabase } from '../infrastructure/postgres/client.js';
import * as schema from '../infrastructure/postgres/schema.js';
import { nativeOrigin, type AuthConfig } from './config.js';
import type { EmailSender } from './email.js';

export function createAuth(dependencies: {
  database: ReturnType<typeof createDatabase>;
  emailSender: EmailSender;
  config: AuthConfig;
  onEmailFailure?: () => void;
}) {
  const { database, emailSender, config } = dependencies;
  const officialExpo = expo();
  const mobilePlugin: ReturnType<typeof expo> = {
    ...officialExpo,
    init(context) {
      const initialization = officialExpo.init(context);
      // The official plugin adds exp:// in development. Keep only our explicit trustedOrigins.
      // Delegate transport/hooks to the plugin; do not copy its authentication implementation.
      return {
        ...initialization,
        options: { ...initialization.options, trustedOrigins: [] },
      };
    },
  };
  const pendingEmails = new Set<Promise<void>>();
  function enqueueEmail(to: string, subject: string, text: string): void {
    // Do not await SMTP in public auth responses. Drain on shutdown; this is not a durable queue.
    const task = Promise.resolve()
      .then(() => emailSender.send({ to, subject, text }))
      .catch(() => dependencies.onEmailFailure?.())
      .finally(() => pendingEmails.delete(task));
    pendingEmails.add(task);
  }
  const auth = betterAuth({
    appName: 'StockApp',
    secret: config.secret,
    baseURL: config.baseURL,
    basePath: '/api/auth',
    database: drizzleAdapter(database, {
      provider: 'pg',
      schema,
      transaction: true,
    }),
    trustedOrigins: [config.appOrigin, nativeOrigin],
    plugins: [mobilePlugin],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: config.resetExpiresIn,
      revokeSessionsOnPasswordReset: true,
      async sendResetPassword({ user, url }) {
        enqueueEmail(
          user.email,
          'Restablece tu contraseña de StockApp',
          `Solicitaste restablecer tu contraseña. Abre este enlace:\n${url}\nEl enlace vence en ${config.resetExpiresIn / 60} minutos. Si no lo solicitaste, ignora este correo.`,
        );
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: false,
      autoSignInAfterVerification: false,
      expiresIn: config.verificationExpiresIn,
      async sendVerificationEmail({ user, url }) {
        enqueueEmail(
          user.email,
          'Verifica tu correo para StockApp',
          `Verifica tu correo abriendo este enlace:\n${url}\nEl enlace vence en ${config.verificationExpiresIn / 3600} horas.`,
        );
      },
    },
    session: {
      expiresIn: 7 * 24 * 60 * 60,
      disableSessionRefresh: true,
      freshAge: 5 * 60,
      cookieCache: { enabled: false },
    },
    user: { deleteUser: { enabled: false }, changeEmail: { enabled: false } },
    disabledPaths: [
      '/delete-user',
      '/delete-user/callback',
      '/change-email',
      '/update-user',
      '/change-password',
      '/set-password',
      '/verify-password',
      '/update-session',
      '/sign-in/social',
      '/link-social',
      '/unlink-account',
      '/list-accounts',
      '/refresh-token',
      '/get-access-token',
      '/account-info',
      '/expo-authorization-proxy',
    ],
    advanced: {
      useSecureCookies: config.secureCookies,
      defaultCookieAttributes: {
        httpOnly: true,
        secure: config.secureCookies,
        sameSite: 'lax',
        path: '/',
      },
      crossSubDomainCookies: { enabled: false },
      disableCSRFCheck: false,
      disableOriginCheck: false,
    },
    logger: { disabled: true },
    onAPIError: {
      onError(error) {
        // better-call otherwise writes unexpected errors to console, bypassing logger.disabled.
        // Throw only a generic official APIError; normal library validation errors keep their shape.
        if (!isAPIError(error)) {
          throw new APIError('INTERNAL_SERVER_ERROR', {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Authentication could not be completed.',
          });
        }
      },
    },
    telemetry: { enabled: false },
  });
  return {
    auth,
    async drainEmails(): Promise<void> {
      while (pendingEmails.size) await Promise.all(pendingEmails);
    },
  };
}

export type StockAppAuth = ReturnType<typeof createAuth>['auth'];
