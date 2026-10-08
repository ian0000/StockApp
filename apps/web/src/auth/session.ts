import type { BootstrapRequest, MeResponse } from '@stock-app/contracts';
import type { QueryClient } from '@tanstack/react-query';
import { ApiClientError } from '../api/client.js';
import type { OwnershipClient } from '../api/ownership.js';
import { AuthFailure, type SessionIdentity, type WebAuth } from './client.js';

export type AccessState =
  | 'NO_BUSINESS'
  | 'BUSINESS_ACTIVE_DISABLED'
  | 'BUSINESS_ACTIVE_ENABLED'
  | 'BUSINESS_DELETING'
  | 'BUSINESS_WITHOUT_INVENTORY';
export function accessState(me: MeResponse): AccessState {
  if (!me.business) return 'NO_BUSINESS';
  if (me.business.status === 'DELETING') return 'BUSINESS_DELETING';
  if (!me.inventory) return 'BUSINESS_WITHOUT_INVENTORY';
  return me.business.cloudAccessEnabled
    ? 'BUSINESS_ACTIVE_ENABLED'
    : 'BUSINESS_ACTIVE_DISABLED';
}
export type SessionView = {
  generation: number;
} & (
  | {
      kind:
        | 'LOADING_SESSION'
        | 'ANONYMOUS'
        | 'AUTHENTICATED_LOADING_ME'
        | 'LOGGING_OUT';
    }
  | {
      kind: 'ERROR' | 'LOGOUT_ERROR';
      message: string;
      verification?: boolean;
      cloudDisabled?: boolean;
    }
  | { kind: AccessState; me: MeResponse }
);
export function privateDestination(
  view: SessionView,
): '/login' | '/onboarding' | null {
  if (view.kind === 'ANONYMOUS') return '/login';
  if (view.kind === 'NO_BUSINESS') return '/onboarding';
  return null;
}
export function privateQueryKey(
  generation: number,
  businessId: string,
  inventoryId: string,
  ...parts: string[]
) {
  return ['private', generation, businessId, inventoryId, ...parts] as const;
}

export class SessionController {
  private view: SessionView = { kind: 'LOADING_SESSION', generation: 0 };
  private identity: SessionIdentity | null = null;
  private listeners = new Set<() => void>();
  private boundaryListeners = new Set<() => void>();
  private pending?: AbortController;
  private epoch = 0;
  private authBusy = false;
  constructor(
    readonly auth: WebAuth,
    private ownership: OwnershipClient,
    private queries: QueryClient,
  ) {}
  snapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  onBoundary = (listener: () => void) => {
    this.boundaryListeners.add(listener);
    return () => {
      this.boundaryListeners.delete(listener);
    };
  };
  private publish(view: SessionView) {
    this.view = view;
    for (const listener of this.listeners) listener();
  }
  private boundary() {
    for (const listener of this.boundaryListeners) listener();
    this.pending?.abort();
    this.epoch++;
    this.identity = null;
    this.queries.clear();
    this.publish({
      kind: 'LOADING_SESSION',
      generation: this.view.generation + 1,
    });
  }
  private anonymous() {
    this.boundary();
    this.publish({ kind: 'ANONYMOUS', generation: this.view.generation });
  }
  private failed(error: unknown) {
    if (
      (error instanceof ApiClientError && error.status === 401) ||
      (error instanceof AuthFailure && error.status === 401)
    ) {
      this.anonymous();
      return;
    }
    const verification =
      error instanceof ApiClientError &&
      error.apiError?.error.code === 'EMAIL_NOT_VERIFIED';
    const cloudDisabled =
      error instanceof ApiClientError &&
      error.apiError?.error.code === 'CLOUD_ACCESS_DISABLED';
    this.publish({
      kind: 'ERROR',
      generation: this.view.generation,
      message: cloudDisabled
        ? 'Tu acceso cloud no está habilitado. Puedes refrescar el estado o cerrar sesión.'
        : 'No pudimos comprobar tu acceso. Vuelve a intentarlo.',
      verification,
      cloudDisabled,
    });
  }
  async refresh(): Promise<void> {
    if (this.authBusy || this.view.kind === 'LOGOUT_ERROR') return;
    this.pending?.abort();
    const request = new AbortController();
    this.pending = request;
    const epoch = ++this.epoch;
    this.publish({ kind: 'LOADING_SESSION', generation: this.view.generation });
    try {
      const next = await this.auth.session(request.signal);
      if (epoch !== this.epoch || request.signal.aborted) return;
      if (!next || next.expiresAt <= Date.now()) {
        this.anonymous();
        return;
      }
      if (
        this.identity?.userId !== next.userId ||
        this.identity?.sessionId !== next.sessionId
      ) {
        // First hydration preserves the minimal reload descriptor; a known identity change clears it.
        if (this.identity)
          for (const listener of this.boundaryListeners) listener();
        this.queries.clear();
        this.view = {
          kind: 'AUTHENTICATED_LOADING_ME',
          generation: this.view.generation + 1,
        };
      }
      this.identity = next;
      this.publish({
        kind: 'AUTHENTICATED_LOADING_ME',
        generation: this.view.generation,
      });
      const me = await this.queries.fetchQuery({
        queryKey: ['private', this.view.generation, 'me', next.userId],
        queryFn: ({ signal }) => this.ownership.me(signal),
        staleTime: 0,
      });
      if (epoch !== this.epoch || request.signal.aborted) return;
      if (me.user.id !== next.userId) {
        this.boundary();
        this.failed(new Error('Identity mismatch'));
        return;
      }
      this.publish({
        kind: accessState(me),
        generation: this.view.generation,
        me,
      });
    } catch (error) {
      if (epoch === this.epoch && !request.signal.aborted) this.failed(error);
    }
  }
  async login(email: string, password: string): Promise<void> {
    if (this.authBusy) return;
    this.authBusy = true;
    this.boundary();
    try {
      await this.auth.login(email, password);
    } catch (error) {
      this.anonymous();
      throw error;
    } finally {
      this.authBusy = false;
    }
    await this.refresh();
  }
  async logout(): Promise<void> {
    if (this.authBusy) return;
    this.authBusy = true;
    this.boundary();
    this.publish({ kind: 'LOGGING_OUT', generation: this.view.generation });
    try {
      await this.auth.logout();
      this.anonymous();
    } catch {
      this.publish({
        kind: 'LOGOUT_ERROR',
        generation: this.view.generation,
        message:
          'Retiramos los datos de esta pantalla, pero no pudimos cerrar la sesión en el servidor. Reintenta cerrar sesión.',
      });
    } finally {
      this.authBusy = false;
    }
  }
  async reset(token: string, password: string): Promise<void> {
    if (this.authBusy) return;
    this.authBusy = true;
    this.boundary();
    try {
      await this.auth.reset(token, password);
      this.anonymous();
    } catch (error) {
      this.failed(error);
      throw error;
    } finally {
      this.authBusy = false;
    }
  }
  async bootstrap(input: BootstrapRequest): Promise<void> {
    if (this.view.kind !== 'NO_BUSINESS' || !this.identity)
      throw new Error('Access unavailable');
    const epoch = this.epoch;
    const request = new AbortController();
    this.pending = request;
    try {
      await this.ownership.bootstrap(input, request.signal);
      if (epoch !== this.epoch || request.signal.aborted) return;
      await this.queries.invalidateQueries({
        queryKey: ['private', this.view.generation, 'me'],
      });
      await this.refresh();
    } catch (error) {
      if (epoch === this.epoch && !request.signal.aborted) {
        this.failed(error);
        throw error;
      }
    }
  }
  expire() {
    this.anonymous();
  }
  handleBusinessError(error: unknown) {
    if (!(error instanceof ApiClientError)) return;
    if (error.status === 401) this.anonymous();
    else if (
      error.status === 403 &&
      [
        'EMAIL_NOT_VERIFIED',
        'CLOUD_ACCESS_DISABLED',
        'BUSINESS_DELETING',
      ].includes(error.apiError?.error.code ?? '')
    ) {
      this.queries.clear();
      this.failed(error);
    }
  }
  dispose() {
    this.pending?.abort();
    this.epoch++;
  }
}
