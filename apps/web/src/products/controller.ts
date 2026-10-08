import type { CreateProductCommand } from '@stock-app/contracts';
import type { QueryClient } from '@tanstack/react-query';
import { ApiClientError } from '../api/client.js';
import { SessionController, privateQueryKey } from '../auth/session.js';
import type { ProductsClient } from './client.js';
import {
  buildProductCommand,
  ProductFormError,
  type ProductForm,
} from './input.js';
import {
  clearPending,
  readPending,
  writePending,
  type PendingProduct,
  type PendingStorage,
} from './pending.js';

export type ProductScope = {
  generation: number;
  businessId: string;
  inventoryId: string;
  currency: string;
};
export function productScope(session: SessionController): ProductScope | null {
  const view = session.snapshot();
  if (
    view.kind !== 'BUSINESS_ACTIVE_ENABLED' ||
    !view.me.business ||
    !view.me.inventory
  )
    return null;
  return {
    generation: view.generation,
    businessId: view.me.business.id,
    inventoryId: view.me.inventory.id,
    currency: view.me.inventory.currency,
  };
}
export const productsKey = (scope: ProductScope, ...parts: string[]) =>
  privateQueryKey(
    scope.generation,
    scope.businessId,
    scope.inventoryId,
    'products',
    ...parts,
  );
export type ProductMutationView = {
  kind: 'READY' | 'SENDING' | 'UNCERTAIN' | 'CHECKING' | 'ACCEPTED' | 'ERROR';
  message: string;
  field?: keyof ProductForm;
  canRetry?: boolean;
};
export function productErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 429) {
      const seconds = error.headers.get('retry-after');
      return /^\d+$/.test(seconds ?? '')
        ? `Demasiados intentos. Vuelve a intentarlo en ${seconds} segundos.`
        : 'Demasiados intentos. Espera un momento y reintenta.';
    }
    if (error.apiError?.error.code === 'IDEMPOTENCY_KEY_REUSED')
      return 'La identificación de este envío ya fue utilizada con otros datos. Comprueba el estado antes de volver a completar el formulario.';
    if (error.status === 400)
      return 'Revisa los datos del producto e inténtalo nuevamente.';
    if (error.status === 422)
      return 'No pudimos registrar el producto con esos datos. Revisa el código de barras, la cantidad y el costo inicial.';
    if (error.status === 404)
      return 'No encontramos el recurso en tu inventario.';
  }
  return 'No pudimos completar la consulta. Vuelve a intentarlo.';
}

export class ProductsController {
  private descriptor: PendingProduct | null;
  private intent: CreateProductCommand | null = null;
  private view: ProductMutationView;
  private listeners = new Set<() => void>();
  private request?: AbortController;
  private epoch = 0;
  private busy = false;
  private recoveryScope: string | null = null;
  private unsubscribe: () => void;
  private unsubscribeBoundary: () => void;
  constructor(
    readonly client: ProductsClient,
    readonly session: SessionController,
    readonly queries: QueryClient,
    private storage: PendingStorage,
    private online: () => boolean = () =>
      typeof navigator === 'undefined' || navigator.onLine,
  ) {
    this.descriptor = readPending(storage);
    this.view = this.descriptor
      ? { kind: 'UNCERTAIN', message: 'Estamos comprobando el envío anterior.' }
      : { kind: 'READY', message: '' };
    this.unsubscribeBoundary = session.onBoundary(() => this.reset());
    this.unsubscribe = session.subscribe(() => this.reconcile());
    this.reconcile();
  }
  snapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(view: ProductMutationView) {
    this.view = view;
    for (const listener of this.listeners) listener();
  }
  private reset() {
    this.request?.abort();
    this.epoch++;
    this.busy = false;
    this.intent = null;
    this.descriptor = null;
    this.recoveryScope = null;
    clearPending(this.storage);
    this.publish({ kind: 'READY', message: '' });
  }
  private reconcile() {
    const scope = productScope(this.session);
    if (!scope) return;
    if (
      this.descriptor &&
      this.descriptor.inventoryId.toLowerCase() !==
        scope.inventoryId.toLowerCase()
    ) {
      this.reset();
      return;
    }
    const key = `${scope.generation}/${scope.businessId}/${scope.inventoryId}`;
    if (
      this.descriptor &&
      !this.intent &&
      this.recoveryScope !== key &&
      !this.busy
    ) {
      this.recoveryScope = key;
      void this.check();
    }
  }
  private current(epoch: number, scope: ProductScope) {
    return (
      epoch === this.epoch &&
      this.session.snapshot().generation === scope.generation
    );
  }
  private async accepted(
    scope: ProductScope,
    epoch: number,
    recovered: boolean,
  ) {
    this.intent = null;
    this.descriptor = null;
    clearPending(this.storage);
    await this.queries.invalidateQueries({
      queryKey: productsKey(scope, 'list'),
    });
    if (this.current(epoch, scope))
      this.publish({
        kind: 'ACCEPTED',
        message: recovered
          ? 'El producto anterior sí fue registrado.'
          : 'Producto registrado.',
      });
  }
  async submit(form: ProductForm) {
    if (
      this.busy ||
      this.descriptor ||
      this.intent ||
      this.view.kind === 'ACCEPTED'
    )
      return;
    const scope = productScope(this.session);
    if (!scope || !this.online()) {
      this.publish({
        kind: 'ERROR',
        message:
          'Necesitas conexión y acceso al inventario para registrar el producto.',
      });
      return;
    }
    try {
      this.intent = buildProductCommand(form);
    } catch (error) {
      this.publish({
        kind: 'ERROR',
        message:
          error instanceof ProductFormError
            ? error.message
            : 'Revisa los datos del producto.',
        ...(error instanceof ProductFormError ? { field: error.field } : {}),
      });
      return;
    }
    await this.send(scope);
  }
  async retry() {
    const scope = productScope(this.session);
    if (
      !scope ||
      !this.intent ||
      this.busy ||
      this.view.kind !== 'UNCERTAIN' ||
      !this.online()
    )
      return;
    await this.send(scope);
  }
  private async send(scope: ProductScope) {
    const command = this.intent;
    if (!command) return;
    this.busy = true;
    const epoch = ++this.epoch;
    const request = new AbortController();
    this.request = request;
    let started = false;
    const previouslySent = this.descriptor !== null;
    this.publish({ kind: 'SENDING', message: 'Registrando…' });
    try {
      await this.client.create(
        scope.inventoryId,
        command,
        request.signal,
        () => {
          const currentScope = productScope(this.session);
          if (
            !this.current(epoch, scope) ||
            !currentScope ||
            currentScope.inventoryId !== scope.inventoryId ||
            currentScope.businessId !== scope.businessId ||
            request.signal.aborted
          )
            throw new Error('Session boundary');
          const descriptor: PendingProduct = {
            operationId: command.operationId,
            inventoryId: scope.inventoryId,
            commandKind: 'PRODUCT_CREATE',
          };
          writePending(this.storage, descriptor);
          this.descriptor = descriptor;
          started = true;
        },
      );
      if (this.current(epoch, scope)) await this.accepted(scope, epoch, false);
    } catch (error) {
      if (!this.current(epoch, scope)) return;
      this.session.handleBusinessError(error);
      if (!this.current(epoch, scope)) return;
      const definitive =
        error instanceof ApiClientError &&
        error.kind === 'HTTP' &&
        [400, 401, 403, 404, 409, 413, 415, 422, 429].includes(
          error.status ?? 0,
        );
      if ((!started && previouslySent) || (started && !definitive)) {
        this.publish({
          kind: 'UNCERTAIN',
          message:
            'No sabemos aún si se registró. Comprueba el estado o reintenta el mismo envío.',
          canRetry: true,
        });
      } else {
        this.intent = null;
        this.descriptor = null;
        clearPending(this.storage);
        this.publish({
          kind: 'ERROR',
          message: started
            ? productErrorMessage(error)
            : 'No pudimos preparar el envío. El comando no fue enviado; vuelve a intentarlo.',
        });
      }
    } finally {
      if (epoch === this.epoch) this.busy = false;
    }
  }
  async check() {
    const scope = productScope(this.session),
      descriptor = this.descriptor;
    if (
      !scope ||
      !descriptor ||
      this.busy ||
      descriptor.inventoryId.toLowerCase() !== scope.inventoryId.toLowerCase()
    )
      return;
    this.busy = true;
    const epoch = ++this.epoch,
      request = new AbortController();
    this.request = request;
    this.publish({
      kind: 'CHECKING',
      message: 'Estamos comprobando si se registró.',
    });
    try {
      const receipt = await this.client.receipt(
        scope.inventoryId,
        descriptor.operationId,
        request.signal,
      );
      if (!this.current(epoch, scope)) return;
      if (receipt?.status === 'ACCEPTED')
        await this.accepted(scope, epoch, true);
      else if (receipt) {
        this.intent = null;
        this.descriptor = null;
        clearPending(this.storage);
        this.publish({
          kind: 'ERROR',
          message:
            'El envío anterior no fue aceptado. Revisa los datos antes de volver a completar el formulario.',
        });
      } else
        this.publish({
          kind: 'UNCERTAIN',
          message: 'No pudimos confirmar el envío anterior.',
          canRetry: this.intent !== null,
        });
    } catch (error) {
      if (!this.current(epoch, scope)) return;
      this.session.handleBusinessError(error);
      if (this.current(epoch, scope))
        this.publish({
          kind: 'UNCERTAIN',
          message: `No pudimos confirmar el envío anterior. ${productErrorMessage(error)}`,
          canRetry: this.intent !== null,
        });
    } finally {
      if (epoch === this.epoch) this.busy = false;
    }
  }
  discard() {
    if (!this.busy && this.view.kind === 'UNCERTAIN') this.reset();
  }
  acknowledge() {
    if (this.view.kind === 'ACCEPTED')
      this.publish({ kind: 'READY', message: '' });
  }
  dispose() {
    this.unsubscribe();
    this.unsubscribeBoundary();
    this.request?.abort();
    this.epoch++;
  }
}
