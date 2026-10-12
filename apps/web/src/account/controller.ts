import { v7 } from 'uuid';
import type { SessionController, SessionView } from '../auth/session.js';
import { ApiClientError } from '../api/client.js';
import { AuthFailure } from '../auth/client.js';
import type { AccountClient } from './client.js';
import { JsonDownloads } from './download.js';

export type AccountView = {
  kind:
    | 'READY'
    | 'REVIEW'
    | 'BACKUP'
    | 'EXPORT'
    | 'DELETING'
    | 'UNKNOWN'
    | 'ACCEPTED'
    | 'ERROR'
    | 'REAUTH_REQUIRED'
    | 'REAUTHENTICATING';
  message: string;
  canRetry?: boolean;
};
export const deletionUnknown =
  'No pudimos confirmar si la solicitud se registró. Es posible que tu sesión se haya cerrado como parte del proceso.';
export const deletionAccepted =
  'Tu solicitud de eliminación fue aceptada. Se cerraron tus sesiones y la eliminación de datos continuará en el servidor.';
export function accountScope(view: SessionView) {
  if (!('me' in view) || !view.me.user.emailVerified) return null;
  return {
    generation: view.generation,
    userId: view.me.user.id,
    businessId: view.me.business?.id ?? null,
    inventoryId: view.me.inventory?.id ?? null,
  };
}
type AccountScope = NonNullable<ReturnType<typeof accountScope>>;
const same = (a: AccountScope, b: AccountScope) =>
  JSON.stringify(a) === JSON.stringify(b);
export function accountError(error: unknown) {
  if (error instanceof ApiClientError) {
    const code = error.apiError?.error.code;
    if (code === 'SESSION_NOT_FRESH')
      return 'Por seguridad, vuelve a iniciar sesión para continuar.';
    if (code === 'EMAIL_NOT_VERIFIED')
      return 'Verifica tu correo para continuar.';
    if (code === 'CLOUD_ACCESS_DISABLED')
      return 'Esta descarga no está disponible con el acceso actual de tu cuenta.';
    if (error.status === 401)
      return 'Tu sesión no está disponible. Vuelve a iniciar sesión.';
    if (error.status === 403)
      return 'No tienes permiso para realizar esta acción.';
    if (error.status === 404) return 'No encontramos los datos solicitados.';
    if (error.status === 409)
      return 'La solicitud no pudo registrarse con esa clave. Revisa tu cuenta antes de continuar.';
    if (error.status === 429)
      return 'Demasiados intentos. Espera un momento antes de continuar.';
    if (error.kind === 'INVALID_JSON')
      return 'No pudimos comprobar la respuesta. Vuelve a intentarlo.';
  }
  return 'No pudimos completar la solicitud. Vuelve a intentarlo.';
}
export class AccountController {
  private view: AccountView = { kind: 'READY', message: '' };
  private listeners = new Set<() => void>();
  private scope?: AccountScope;
  private request?: AbortController;
  private key?: string;
  private sent = false;
  private epoch = 0;
  private busy = false;
  private publicGeneration?: number;
  private stopBoundary: () => void;
  private stopSession: () => void;
  constructor(
    readonly client: AccountClient,
    readonly session: SessionController,
    readonly downloads = new JsonDownloads(),
    readonly online = () =>
      typeof navigator === 'undefined' || navigator.onLine,
    readonly uuid = v7,
  ) {
    this.stopBoundary = session.onBoundary(() => {
      const publicOutcome =
        !this.scope && ['ACCEPTED', 'UNKNOWN'].includes(this.view.kind)
          ? this.view
          : null;
      this.reset(this.sent);
      if (publicOutcome)
        this.publish({
          kind: publicOutcome.kind,
          message: publicOutcome.message,
        });
    });
    this.stopSession = session.subscribe(() => {
      if (['ERROR', 'LOGOUT_ERROR'].includes(session.snapshot().kind)) {
        if (this.scope) this.reset(this.sent);
        return;
      }
      const next = accountScope(session.snapshot());
      if (next && this.scope && !same(next, this.scope)) this.reset(this.sent);
      // A public outcome carries no private identity; a new hydrated account starts independently.
      if (
        next &&
        !this.scope &&
        ['ACCEPTED', 'UNKNOWN'].includes(this.view.kind) &&
        next.generation !== this.publicGeneration
      )
        this.reset(false);
    });
  }
  snapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(view: AccountView) {
    if (['ACCEPTED', 'UNKNOWN'].includes(view.kind) && !this.scope)
      this.publicGeneration = this.session.snapshot().generation;
    else if (!['ACCEPTED', 'UNKNOWN'].includes(view.kind))
      this.publicGeneration = undefined;
    this.view = view;
    for (const listener of this.listeners) listener();
  }
  private reset(unknown: boolean) {
    this.request?.abort();
    this.epoch++;
    this.busy = false;
    this.scope = undefined;
    this.key = undefined;
    this.sent = false;
    this.downloads.clear();
    this.publish(
      unknown
        ? { kind: 'UNKNOWN', message: deletionUnknown }
        : { kind: 'READY', message: '' },
    );
  }
  private current(epoch: number, scope: AccountScope) {
    const view = this.session.snapshot(),
      next = accountScope(view);
    return (
      epoch === this.epoch &&
      view.generation === scope.generation &&
      (next
        ? same(next, scope)
        : ['LOADING_SESSION', 'AUTHENTICATED_LOADING_ME'].includes(view.kind))
    );
  }
  private available() {
    const scope = accountScope(this.session.snapshot());
    if (!scope) return null;
    if (!this.online()) {
      this.publish({
        ...this.view,
        message: 'Sin conexión. Conéctate para realizar esta acción.',
      });
      return null;
    }
    return scope;
  }
  reviewDeletion() {
    if (this.busy || this.key) return;
    const scope = this.available();
    if (!scope) return;
    this.scope = scope;
    this.publish({ kind: 'REVIEW', message: '' });
  }
  cancel() {
    if (!this.busy && !this.key) this.reset(false);
  }
  routeChanged(path: string) {
    if (!path.startsWith('/settings') && !this.busy && !this.key)
      this.reset(false);
    if (path !== '/settings/privacy' && this.view.kind === 'REVIEW')
      this.reset(false);
  }
  async download(kind: 'BACKUP' | 'EXPORT') {
    if (this.busy || this.key || this.view.kind === 'REVIEW') return;
    const scope = this.available(),
      meta = this.session.snapshot();
    if (!scope || !('me' in meta)) return;
    if (
      (kind === 'BACKUP' && meta.kind !== 'BUSINESS_ACTIVE_ENABLED') ||
      (kind === 'EXPORT' && meta.kind === 'BUSINESS_DELETING')
    )
      return;
    this.busy = true;
    this.scope = scope;
    const request = (this.request = new AbortController()),
      epoch = ++this.epoch;
    this.publish({
      kind,
      message:
        kind === 'BACKUP' ? 'Preparando respaldo…' : 'Preparando exportación…',
    });
    try {
      const data =
        kind === 'BACKUP'
          ? await this.client.backup(scope.inventoryId!, request.signal)
          : await this.client.export(request.signal);
      if (!this.current(epoch, scope) || request.signal.aborted) return;
      if (
        'user' in data &&
        (data.user.id !== scope.userId ||
          data.user.email !== meta.me.user.email ||
          !data.user.emailVerified ||
          (data.backup && data.backup.inventoryId !== scope.inventoryId))
      )
        throw new ApiClientError('INVALID_JSON', 200);
      this.downloads.save(
        data,
        kind === 'BACKUP'
          ? 'stockapp-backup.json'
          : 'stockapp-account-export.json',
      );
      this.publish({
        kind: 'READY',
        message:
          kind === 'BACKUP'
            ? 'Respaldo preparado. Comprueba que el archivo se haya guardado correctamente.'
            : 'Exportación preparada. Comprueba que el archivo se haya guardado correctamente.',
      });
    } catch (error) {
      if (this.current(epoch, scope) && !request.signal.aborted)
        this.failure(error);
    } finally {
      if (epoch === this.epoch) this.busy = false;
    }
  }
  private failure(error: unknown) {
    if (error instanceof ApiClientError && error.status === 401)
      this.session.expire();
    this.publish({
      kind:
        error instanceof ApiClientError &&
        error.apiError?.error.code === 'SESSION_NOT_FRESH'
          ? 'REAUTH_REQUIRED'
          : 'ERROR',
      message: accountError(error),
    });
  }
  async confirmDeletion() {
    if (this.view.kind !== 'REVIEW' || this.busy || !this.scope) return;
    const now = this.available();
    if (!now || !same(now, this.scope)) return;
    this.key = this.uuid();
    await this.sendDeletion(now);
  }
  async retryDeletion() {
    const now = this.available();
    if (
      this.busy ||
      this.view.kind !== 'UNKNOWN' ||
      !this.key ||
      !this.scope ||
      !now ||
      !same(now, this.scope)
    )
      return;
    await this.sendDeletion(now);
  }
  private async sendDeletion(scope: AccountScope) {
    if (!this.key) return;
    this.busy = true;
    const request = (this.request = new AbortController()),
      epoch = ++this.epoch;
    this.publish({ kind: 'DELETING', message: 'Solicitando eliminación…' });
    try {
      await this.client.deletion(this.key, request.signal, () => {
        this.sent = true;
      });
      if (!this.current(epoch, scope) || request.signal.aborted) return;
      this.sent = false;
      this.session.expire();
      this.publish({ kind: 'ACCEPTED', message: deletionAccepted });
    } catch (error) {
      if (!this.current(epoch, scope) || request.signal.aborted) return;
      const unknown =
        this.sent &&
        (!(error instanceof ApiClientError) ||
          error.status === null ||
          error.status === 401 ||
          error.status >= 500 ||
          error.kind === 'INVALID_JSON');
      if (unknown) {
        if (error instanceof ApiClientError && error.status === 401)
          this.session.expire();
        this.publish({
          kind: 'UNKNOWN',
          message: deletionUnknown,
          canRetry: Boolean(this.key && accountScope(this.session.snapshot())),
        });
      } else {
        this.key = undefined;
        this.sent = false;
        this.failure(error);
      }
    } finally {
      if (epoch === this.epoch) this.busy = false;
    }
  }
  async reauthenticate(password: string) {
    const meta = this.session.snapshot(),
      scope = this.available();
    if (this.busy || !scope || !('me' in meta)) return;
    // Only the official sign-in creates a fresh session. No export/delete is replayed here.
    this.busy = true;
    try {
      await this.session.login(meta.me.user.email, password);
      const next = accountScope(this.session.snapshot());
      if (!next || next.userId !== scope.userId) {
        if (next) await this.session.logout();
        this.publish({
          kind: 'ERROR',
          message:
            'No pudimos confirmar que volviste a la misma cuenta. Inicia sesión nuevamente.',
        });
        return;
      }
      this.publish({
        kind: 'READY',
        message:
          'Volviste a iniciar sesión. Inicia nuevamente la acción que deseas realizar.',
      });
    } catch (error) {
      this.publish({
        kind: 'ERROR',
        message:
          error instanceof AuthFailure ? error.message : accountError(error),
      });
    } finally {
      this.busy = false;
    }
  }
  dispose() {
    this.reset(false);
    this.stopBoundary();
    this.stopSession();
  }
}
