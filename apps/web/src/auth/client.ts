import { createAuthClient } from 'better-auth/react';
import { parseApiUrl } from '../api/config.js';

export class AuthFailure extends Error {
  constructor(
    readonly code: string | undefined,
    readonly status: number | undefined,
  ) {
    super(authMessage(code, status));
  }
}

export function authMessage(code?: string, status?: number): string {
  if (status === 429)
    return 'Espera unos minutos antes de volver a intentarlo.';
  if (code === 'EMAIL_NOT_VERIFIED')
    return 'Verifica tu correo antes de iniciar sesión.';
  if (status === 401 || code === 'INVALID_EMAIL_OR_PASSWORD')
    return 'No pudimos iniciar sesión. Revisa el correo y la contraseña.';
  return 'No pudimos completar la solicitud. Vuelve a intentarlo.';
}

export interface SessionIdentity {
  userId: string;
  sessionId: string;
  expiresAt: number;
}

export function createWebAuth(
  baseUrl: string,
  appOrigin: string,
  fetcher: typeof fetch = globalThis.fetch,
) {
  const client = createAuthClient({
    baseURL: parseApiUrl(baseUrl),
    basePath: '/api/auth',
    disableDefaultFetchPlugins: true,
    fetchOptions: {
      credentials: 'include',
      cache: 'no-store',
      retry: 0,
      redirect: 'error',
      customFetchImpl: fetcher,
    },
  });
  const verifyCallback = new URL('/verify-email?verified=1', appOrigin).href;
  const resetCallback = new URL('/reset-password', appOrigin).href;
  // Use imperative official methods only. No useSession atom mount/storage broadcast.
  const options = { disableSignal: true };
  function checked(error: { code?: string; status?: number } | null): void {
    if (error) throw new AuthFailure(error.code, error.status);
  }
  return {
    async session(signal?: AbortSignal): Promise<SessionIdentity | null> {
      const { data, error } = await client.getSession({
        fetchOptions: { ...options, signal },
      });
      checked(error);
      if (!data) return null;
      // Never retain the official response's token/password/account material.
      const expiresAt = new Date(data.session.expiresAt).getTime();
      if (!data.user.id || !data.session.id || !Number.isFinite(expiresAt))
        throw new AuthFailure(undefined, undefined);
      return { userId: data.user.id, sessionId: data.session.id, expiresAt };
    },
    async signup(name: string, email: string, password: string): Promise<void> {
      const { error } = await client.signUp.email(
        { name, email, password, callbackURL: verifyCallback },
        options,
      );
      checked(error);
    },
    async login(email: string, password: string): Promise<void> {
      const { error } = await client.signIn.email({ email, password }, options);
      checked(error);
    },
    async logout(): Promise<void> {
      const { error } = await client.signOut({ fetchOptions: options });
      checked(error);
    },
    async resend(email: string): Promise<void> {
      const { error } = await client.sendVerificationEmail(
        { email, callbackURL: verifyCallback },
        options,
      );
      checked(error);
    },
    async verify(token: string): Promise<void> {
      const { error } = await client.verifyEmail({
        query: { token },
        fetchOptions: options,
      });
      checked(error);
    },
    async requestReset(email: string): Promise<void> {
      const { error } = await client.requestPasswordReset(
        { email, redirectTo: resetCallback },
        options,
      );
      checked(error);
    },
    async reset(token: string, newPassword: string): Promise<void> {
      const { error } = await client.resetPassword(
        { token, newPassword },
        options,
      );
      checked(error);
    },
  };
}
export type WebAuth = ReturnType<typeof createWebAuth>;
