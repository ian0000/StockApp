import { backupFixture } from '../backup/helpers.js';
import type { TestContext } from 'node:test';
import { registerOwnershipRoutes } from '../../src/ownership/routes.js';
import { registerDeletionRoutes } from '../../src/deletion/routes.js';
import { claimDeletion, advanceDeletion } from '../../src/deletion/worker.js';
import { id } from '../postgres/helpers.js';

export const suppressionSecret = 'fictional-api10-suppression-key-only';
export async function deletionFixture(t: TestContext) {
  const f = await backupFixture(t);
  const keys = { suppressionSecret, authSecret: f.config.secret };
  registerOwnershipRoutes(f.app, f.runtime.auth, f.db);
  registerDeletionRoutes(
    f.app,
    f.runtime.auth,
    f.db,
    suppressionSecret,
    undefined,
    f.clock,
  );
  async function csrf(cookie: string) {
    const response = await f.app.inject({
      url: '/v1/session/csrf',
      headers: { cookie },
    });
    return response.json().token as string;
  }
  async function request(cookie: string, key = id(), token?: string) {
    return f.app.inject({
      method: 'POST',
      url: '/v1/me/deletion',
      payload: {},
      headers: {
        cookie,
        origin: f.config.appOrigin,
        'idempotency-key': key,
        'x-csrf-token': token ?? (await csrf(cookie)),
      },
    });
  }
  async function purge(requestId?: string) {
    const claim = await claimDeletion(f.db, Date.now, [], requestId);
    if (!claim) throw new Error('Expected durable deletion.');
    while ((await advanceDeletion(f.db, claim, keys)) === 'continue') {
      /* Complete durable phases. */
    }
    return claim;
  }
  async function signin(email: string, password?: string) {
    const result = await f.signin(email, password);
    f.setClock(Date.now());
    return result;
  }
  return { ...f, signin, keys, csrf, request, purge };
}
