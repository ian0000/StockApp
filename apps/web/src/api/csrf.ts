import { ApiClientError, type createApiClient } from './client.js';
import validateCsrf from './generated/csrf.mjs';

export async function requestCsrf(
  api: ReturnType<typeof createApiClient>,
  signal: AbortSignal,
) {
  const response = await api.request('/v1/session/csrf', { signal });
  if (response.status !== 200 || !validateCsrf(response.body))
    throw new ApiClientError('INVALID_JSON', response.status);
  return response.body.token;
}
