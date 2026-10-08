import type {
  CreateProductCommand,
  UpdateProductCommand,
  ArchiveProductCommand,
  ProductReadDto,
  ProductDto,
} from '@stock-app/contracts';
import type { QueryClient } from '@tanstack/react-query';
import { ApiClientError } from '../api/client.js';
import { SessionController } from '../auth/session.js';
import type { ProductsClient } from './client.js';
import {
  buildUpdateCommand,
  buildArchiveCommand,
  type ProductEditDraft,
} from './edit.js';

import {
  buildProductCommand,
  ProductFormError,
  type ProductForm,
} from './input.js';
import {
  PENDING_PRODUCT_KEY,
  PRODUCT_COMMAND_KINDS,
  type PendingProduct,
  type PendingStorage,
} from './pending.js';

import {
  ScopedCommandController,
  type AcceptedReceipt,
  type TerminalReceipt,
} from '../commands/controller.js';
import {
  commandScope,
  scopedKey,
  type CommandScope as ProductScope,
} from '../commands/scope.js';

type ProductCommand =
  CreateProductCommand | UpdateProductCommand | ArchiveProductCommand;

export type { ProductScope };
export const productScope = commandScope;
export const productsKey = (scope: ProductScope, ...parts: string[]) =>
  scopedKey(scope, 'products', ...parts);
export type ProductMutationView = {
  kind:
    | 'READY'
    | 'SENDING'
    | 'UNCERTAIN'
    | 'CHECKING'
    | 'ACCEPTED'
    | 'ERROR'
    | 'CONFLICT';
  message: string;
  field?: keyof ProductForm;
  canRetry?: boolean;
  commandKind?: ProductCommand['commandKind'];
  productId?: string;
  latest?: ProductReadDto | null;
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

export class ProductsController extends ScopedCommandController<
  ProductCommand,
  ProductMutationView
> {
  constructor(
    readonly client: ProductsClient,
    session: SessionController,
    queries: QueryClient,
    storage: PendingStorage,
    online?: () => boolean,
  ) {
    super(
      session,
      queries,
      storage,
      { key: PENDING_PRODUCT_KEY, kinds: PRODUCT_COMMAND_KINDS },
      { kind: 'READY', message: '' },
      { kind: 'UNCERTAIN', message: 'Estamos comprobando el envío anterior.' },
      online,
    );
    this.reconcile();
  }
  protected async accepted(
    scope: ProductScope,
    epoch: number,
    recovered: boolean,
    descriptor: PendingProduct,
    receipt?: AcceptedReceipt,
  ) {
    const commandKind = descriptor.commandKind;
    let productId = this.intent?.payload.productId;
    if (receipt) {
      const products = receipt.changeSet.upserts.products,
        p = products[0];
      if (
        products.length !== 1 ||
        !p ||
        p.inventoryId.toLowerCase() !== scope.inventoryId.toLowerCase() ||
        (productId && p.id.toLowerCase() !== productId.toLowerCase()) ||
        p.isArchived !== (commandKind === 'PRODUCT_ARCHIVE')
      )
        throw new ApiClientError('INVALID_JSON', 200);
      productId = p.id;
    }
    this.clearIntent();
    if (commandKind === 'PRODUCT_ARCHIVE') {
      const key = productId
        ? productsKey(scope, 'detail', productId.toLowerCase())
        : productsKey(scope, 'detail');
      await this.queries.cancelQueries({ queryKey: key });
      this.queries.removeQueries({ queryKey: key });
      await this.queries.invalidateQueries({
        queryKey: productsKey(scope, 'list'),
      });
      await this.queries.invalidateQueries({
        queryKey: productsKey(scope, 'barcode'),
      });
    } else
      await this.queries.invalidateQueries({
        queryKey:
          commandKind === 'PRODUCT_CREATE'
            ? productsKey(scope, 'list')
            : productsKey(scope),
      });
    if (this.current(epoch, scope))
      this.publish({
        kind: 'ACCEPTED',
        commandKind,
        productId,
        message:
          commandKind === 'PRODUCT_CREATE'
            ? recovered
              ? 'El producto anterior sí fue registrado.'
              : 'Producto registrado.'
            : commandKind === 'PRODUCT_UPDATE'
              ? recovered
                ? 'El cambio anterior sí fue guardado.'
                : 'Producto actualizado.'
              : recovered
                ? 'El producto anterior fue archivado.'
                : 'Producto archivado. Su historial se conserva.',
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
  async update(draft: ProductEditDraft) {
    await this.prepare(() => buildUpdateCommand(draft));
  }
  async archive(product: ProductDto) {
    await this.prepare(() => buildArchiveCommand(product));
  }
  private async prepare(
    build: () => UpdateProductCommand | ArchiveProductCommand,
  ) {
    if (
      this.busy ||
      this.descriptor ||
      this.intent ||
      ['ACCEPTED', 'CONFLICT'].includes(this.view.kind)
    )
      return;
    const scope = productScope(this.session);
    if (!scope || !this.online()) {
      this.publish({
        kind: 'ERROR',
        message:
          'Necesitas conexión y acceso al inventario para guardar el cambio.',
      });
      return;
    }
    try {
      this.intent = build();
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
  resolveConflict() {
    if (!this.busy && this.view.kind === 'CONFLICT')
      this.publish({ kind: 'READY', message: '' });
  }
  async reviewConflict() {
    const scope = productScope(this.session),
      { commandKind, productId } = this.view;
    if (
      !scope ||
      this.busy ||
      this.view.kind !== 'CONFLICT' ||
      !commandKind ||
      !productId ||
      !this.online()
    )
      return;
    this.busy = true;
    const epoch = ++this.epoch;
    this.request = new AbortController();
    try {
      await this.conflict(scope, epoch, commandKind, productId);
    } finally {
      if (epoch === this.epoch) this.busy = false;
    }
  }
  private async conflict(
    scope: ProductScope,
    epoch: number,
    commandKind: ProductCommand['commandKind'],
    productId?: string,
  ) {
    this.clearIntent();
    this.publish({
      kind: 'CONFLICT',
      commandKind,
      productId,
      message: 'El producto cambió en otro lugar. Tus cambios no se guardaron.',
    });
    await this.queries.invalidateQueries({
      queryKey: productsKey(scope),
      refetchType: 'none',
    });
    if (!productId) {
      await this.queries.refetchQueries({
        queryKey: productsKey(scope, 'detail'),
        type: 'active',
      });
      return;
    }
    try {
      const latest = await this.client.detail(
        scope.inventoryId,
        productId,
        this.request!.signal,
      );
      if (!this.current(epoch, scope)) return;
      this.queries.setQueryData(
        productsKey(scope, 'detail', productId.toLowerCase()),
        latest,
      );
      this.publish({ ...this.view, latest });
    } catch (error) {
      if (!this.current(epoch, scope)) return;
      this.session.handleBusinessError(error);
      if (this.current(epoch, scope))
        this.publish({
          ...this.view,
          message: `${this.view.message} ${productErrorMessage(error)}`,
        });
    }
  }

  protected transient(
    kind: 'SENDING' | 'UNCERTAIN' | 'CHECKING',
    message: string,
    canRetry?: boolean,
  ): ProductMutationView {
    return {
      kind,
      message,
      canRetry,
      commandKind: this.intent?.commandKind ?? this.descriptor?.commandKind,
      productId: this.intent?.payload.productId,
    };
  }
  protected sendCommand(
    scope: ProductScope,
    command: ProductCommand,
    signal: AbortSignal,
    beforeSend: () => void,
  ) {
    return command.commandKind === 'PRODUCT_CREATE'
      ? this.client.create(scope.inventoryId, command, signal, beforeSend)
      : this.client.mutate(scope.inventoryId, command, signal, beforeSend);
  }
  protected readReceipt(
    scope: ProductScope,
    operationId: string,
    signal: AbortSignal,
  ) {
    return this.client.receipt(scope.inventoryId, operationId, signal);
  }
  protected errorMessage(error: unknown) {
    return productErrorMessage(error);
  }
  protected async terminal(
    error: unknown,
    scope: ProductScope,
    epoch: number,
    started: boolean,
  ) {
    const command = this.intent;
    if (
      started &&
      command &&
      command.commandKind !== 'PRODUCT_CREATE' &&
      error instanceof ApiClientError &&
      error.status === 409 &&
      error.apiError?.error.code === 'REVISION_CONFLICT'
    ) {
      await this.conflict(
        scope,
        epoch,
        command.commandKind,
        command.payload.productId,
      );
      return;
    }
    this.clearIntent();
    if (
      started &&
      command &&
      command.commandKind !== 'PRODUCT_CREATE' &&
      error instanceof ApiClientError &&
      error.status === 404
    )
      this.queries.setQueryData(
        productsKey(scope, 'detail', command.payload.productId.toLowerCase()),
        null,
      );
    this.publish({
      kind: 'ERROR',
      message: started
        ? command?.commandKind !== 'PRODUCT_CREATE' &&
          error instanceof ApiClientError &&
          error.status === 422
          ? 'No pudimos guardar el cambio. Revisa los datos y el código de barras.'
          : productErrorMessage(error)
        : 'No pudimos preparar el envío. El comando no fue enviado; vuelve a intentarlo.',
    });
  }
  protected async receiptTerminal(
    receipt: TerminalReceipt,
    scope: ProductScope,
    epoch: number,
    descriptor: PendingProduct,
  ) {
    const productId = this.intent?.payload.productId;
    if (
      receipt.error.code === 'REVISION_CONFLICT' &&
      descriptor.commandKind !== 'PRODUCT_CREATE' &&
      productId !== undefined
    ) {
      await this.conflict(scope, epoch, descriptor.commandKind, productId);
      return;
    }
    this.clearIntent();
    if (descriptor.commandKind !== 'PRODUCT_CREATE')
      await this.queries.invalidateQueries({ queryKey: productsKey(scope) });
    if (this.current(epoch, scope))
      this.publish({
        kind: 'ERROR',
        message:
          'El envío anterior no fue aceptado. Revisa los datos antes de volver a completar el formulario.',
      });
  }
}
