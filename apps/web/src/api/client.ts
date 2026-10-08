import type { ApiErrorEnvelope } from '@stock-app/contracts';
import validateApiError from './generated/api-error.mjs';
import { parseApiUrl } from './config.js';

export class ApiClientError extends Error {
  constructor(
    readonly kind: 'HTTP' | 'NETWORK' | 'INVALID_JSON',
    readonly status: number | null,
    readonly apiError: ApiErrorEnvelope | null = null,
    readonly headers: Headers = new Headers(),
  ) {
    super('No pudimos completar la solicitud.');
    this.name = 'ApiClientError';
  }
}

export interface ApiResponse {
  status: number;
  headers: Headers;
  // Feature callers validate their own DTO using contracts, without a generic cast.
  body: unknown;
}

export function createApiClient({
  baseUrl,
  fetcher = globalThis.fetch,
}: {
  baseUrl: string;
  fetcher?: typeof fetch;
}) {
  const origin = parseApiUrl(baseUrl);
  return {
    async request(
      path: string,
      options: {
        method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
        headers?: HeadersInit;
        body?: unknown;
        signal?: AbortSignal;
      } = {},
    ): Promise<ApiResponse> {
      if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\'))
        throw new TypeError('La ruta debe ser relativa al origen de la API.');
      const url = new URL(path, origin);
      if (url.origin !== origin || url.hash)
        throw new TypeError('La ruta debe pertenecer al origen de la API.');
      const headers = new Headers(options.headers);
      headers.set('accept', 'application/json');
      if (options.body !== undefined)
        headers.set('content-type', 'application/json');
      let bodyText: string | undefined;
      try {
        bodyText =
          options.body === undefined ? undefined : JSON.stringify(options.body);
      } catch {
        throw new ApiClientError('INVALID_JSON', null);
      }
      let response: Response;
      try {
        response = await fetcher(url, {
          method: options.method ?? 'GET',
          headers,
          body: bodyText,
          signal: options.signal,
          credentials: 'include',
          cache: 'no-store',
          redirect: 'error',
        });
      } catch (error) {
        if (options.signal?.aborted) throw error;
        throw new ApiClientError('NETWORK', null);
      }
      if (response.status === 204 && response.ok)
        return {
          status: response.status,
          headers: response.headers,
          body: null,
        };
      const media = response.headers
        .get('content-type')
        ?.split(';')[0]
        .trim()
        .toLowerCase();
      let body: unknown;
      try {
        if (
          media !== 'application/json' &&
          !/^application\/[^/]+\+json$/i.test(media ?? '')
        )
          throw new Error('Expected JSON.');
        body = await response.json();
      } catch {
        throw new ApiClientError(
          response.ok ? 'INVALID_JSON' : 'HTTP',
          response.status,
          null,
          response.headers,
        );
      }
      if (!response.ok)
        throw new ApiClientError(
          'HTTP',
          response.status,
          validateApiError(body) ? body : null,
          response.headers,
        );
      return { status: response.status, headers: response.headers, body };
    },
  };
}
