import type { MeResponse } from '@stock-app/contracts';
import { createWebQueryClient } from '../src/app/providers.js';
import { SessionController } from '../src/auth/session.js';
import type { WebAuth, SessionIdentity } from '../src/auth/client.js';
import type { OwnershipClient } from '../src/api/ownership.js';

export const identity: SessionIdentity = {
  userId: 'user-a',
  sessionId: 'session-a',
  expiresAt: Date.now() + 3_600_000,
};
export const me: MeResponse = {
  user: { id: 'user-a', email: 'a@example.test', emailVerified: true },
  business: {
    id: '019e3000-0000-7000-8000-000000000001',
    status: 'ACTIVE',
    cloudAccessEnabled: true,
  },
  inventory: {
    id: '019e3000-0000-7000-8000-000000000002',
    name: 'Inventario A',
    currency: 'EUR',
    reportingTimeZone: 'Europe/Madrid',
  },
  capabilities: { protocolVersions: [1], domainVersions: [1] },
};
export function fixture(
  authChanges: Partial<WebAuth> = {},
  ownershipChanges: Partial<OwnershipClient> = {},
) {
  const queries = createWebQueryClient();
  const auth: WebAuth = {
    session: async () => identity,
    signup: async () => {},
    login: async () => {},
    logout: async () => {},
    resend: async () => {},
    verify: async () => {},
    requestReset: async () => {},
    reset: async () => {},
    ...authChanges,
  };
  const ownership: OwnershipClient = {
    me: async () => structuredClone(me),
    bootstrap: async () => {
      if (!me.business || !me.inventory) throw new Error('Fixture incomplete');
      return { business: me.business, inventory: me.inventory };
    },
    ...ownershipChanges,
  };
  return {
    queries,
    auth,
    ownership,
    controller: new SessionController(auth, ownership, queries),
  };
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
