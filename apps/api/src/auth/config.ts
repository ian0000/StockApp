type Environment = Readonly<Record<string, string | undefined>>;

export interface AuthConfig {
  secret: string;
  baseURL: string;
  appOrigin: string;
  secureCookies: boolean;
  verificationExpiresIn: number;
  resetExpiresIn: number;
}

export const nativeOrigin = 'inventory-app://';

export function isLoopback(host: string): boolean {
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host);
}

function readOrigin(value: string | undefined, production: boolean): string {
  try {
    if (!value || value.includes('*')) throw new Error();
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/' ||
      !['https:', 'http:'].includes(url.protocol) ||
      (url.protocol === 'http:' && (production || !isLoopback(url.hostname)))
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new Error(
      'Auth origins must be explicit HTTPS origins, or local HTTP outside production.',
    );
  }
}

export function readAuthConfig(env: Environment): AuthConfig {
  const production = env.NODE_ENV === 'production';
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) {
    throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters.');
  }
  // Better Auth also consumes this global variable internally. Use only our explicit mapping.
  if (env.BETTER_AUTH_TRUSTED_ORIGINS) {
    throw new Error('Use APP_ORIGIN instead of BETTER_AUTH_TRUSTED_ORIGINS.');
  }
  const baseURL = readOrigin(env.AUTH_BASE_URL, production);
  return {
    secret: env.BETTER_AUTH_SECRET,
    baseURL,
    appOrigin: readOrigin(env.APP_ORIGIN, production),
    secureCookies: new URL(baseURL).protocol === 'https:',
    verificationExpiresIn: 24 * 60 * 60,
    resetExpiresIn: 30 * 60,
  };
}
