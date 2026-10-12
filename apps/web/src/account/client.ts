import { decodeUuid } from '@stock-app/contracts/transport';
import { ApiClientError, type createApiClient } from '../api/client.js';
import { requestCsrf } from '../api/csrf.js';
import validateBackup from '../api/generated/backup-v1.mjs';
import validateExport from '../api/generated/account-export.mjs';
import validateDeletion from '../api/generated/account-deletion-result.mjs';

export function createAccountClient(api: ReturnType<typeof createApiClient>) {
  return {
    async backup(inventoryId: string, signal: AbortSignal) {
      const response = await api.request(
        `/v1/inventories/${encodeURIComponent(inventoryId)}/backup`,
        { signal },
      );
      if (
        response.status !== 200 ||
        !validateBackup(response.body) ||
        response.body.inventoryId !== inventoryId
      )
        throw new ApiClientError('INVALID_JSON', response.status);
      return response.body;
    },
    async export(signal: AbortSignal) {
      const response = await api.request('/v1/me/export', { signal });
      if (response.status !== 200 || !validateExport(response.body))
        throw new ApiClientError('INVALID_JSON', response.status);
      return response.body;
    },
    async deletion(key: string, signal: AbortSignal, sent: () => void) {
      decodeUuid(key, 7);
      const csrf = await requestCsrf(api, signal);
      if (signal.aborted) throw new Error('Request cancelled.');
      sent();
      const response = await api.request('/v1/me/deletion', {
        method: 'POST',
        body: {},
        signal,
        headers: { 'X-CSRF-Token': csrf, 'Idempotency-Key': key },
      });
      if (
        response.status !== 202 ||
        !validateDeletion(response.body) ||
        !response.body.sessionsRevoked
      )
        throw new ApiClientError('INVALID_JSON', response.status);
      return response.body;
    },
  };
}
export type AccountClient = ReturnType<typeof createAccountClient>;
