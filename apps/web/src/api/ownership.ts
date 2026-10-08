import type { BootstrapRequest } from '@stock-app/contracts';
import { ApiClientError, createApiClient } from './client.js';
import validateMe from './generated/me.mjs';
import validateCsrf from './generated/csrf.mjs';
import validateBootstrap from './generated/bootstrap-response.mjs';
import validateInput from './generated/bootstrap-request.mjs';

export function createOwnershipClient(api: ReturnType<typeof createApiClient>) {
  return {
    async me(signal: AbortSignal) {
      const response = await api.request('/v1/me', { signal });
      if (!validateMe(response.body))
        throw new ApiClientError('INVALID_JSON', response.status);
      return response.body;
    },
    async bootstrap(input: BootstrapRequest, signal: AbortSignal) {
      if (!validateInput(input)) throw new ApiClientError('INVALID_JSON', null);
      const csrf = await api.request('/v1/session/csrf', { signal });
      if (!validateCsrf(csrf.body))
        throw new ApiClientError('INVALID_JSON', csrf.status);
      // Token exists only for this request; never send it to Better Auth or another generation.
      const response = await api.request('/v1/business', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrf.body.token },
        body: input,
        signal,
      });
      if (
        ![200, 201].includes(response.status) ||
        !validateBootstrap(response.body)
      )
        throw new ApiClientError('INVALID_JSON', response.status);
      return response.body;
    },
  };
}
export type OwnershipClient = ReturnType<typeof createOwnershipClient>;

export function suggestedTimeZone(
  resolve = () => Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
  try {
    const value = resolve();
    if (!value || /^[+-]/.test(value)) return '';
    new Intl.DateTimeFormat('es', { timeZone: value });
    return value;
  } catch {
    return '';
  }
}
