import type {
  AdjustStockCommand,
  AdjustStockCommandResult,
  ProductReadDto,
} from '@stock-app/contracts';
import type { QueryClient } from '@tanstack/react-query';
import type { SessionController } from '../auth/session.js';
import { ApiClientError } from '../api/client.js';
import {
  ScopedCommandController,
  type CommandView,
  type AcceptedReceipt,
  type TerminalReceipt,
} from '../commands/controller.js';
import { commandScope, type CommandScope } from '../commands/scope.js';
import type { PendingCommand, PendingStorage } from '../commands/pending.js';
import {
  productsKey,
  productErrorMessage,
  type ProductsController,
} from '../products/controller.js';
import { recoverAdjustment, type AdjustmentsClient } from './client.js';
import {
  physicalCount,
  adjustmentPreview,
  buildAdjustment,
  initialAdjustmentForm,
  AdjustmentInputError,
  type AdjustmentForm,
} from './input.js';
type Review = {
  form: AdjustmentForm;
  read: ProductReadDto;
  preview: ReturnType<typeof adjustmentPreview>;
};
export type AdjustmentView = CommandView & {
  review?: Review;
  result?: AdjustStockCommandResult;
  recovered?: boolean;
  refreshed?: ProductReadDto | null;
  observedStock?: number;
  field?: keyof AdjustmentForm;
};
export const PENDING_ADJUSTMENT_KEY = 'stockapp.pending-adjustment';
export class AdjustmentsController extends ScopedCommandController<
  AdjustStockCommand,
  AdjustmentView
> {
  private result?: AdjustStockCommandResult;
  private review?: Review;
  private draftScope?: CommandScope;
  private draft = {
    form: initialAdjustmentForm(),
    selected: null as ProductReadDto | null,
  };
  constructor(
    readonly client: AdjustmentsClient,
    readonly products: ProductsController,
    session: SessionController,
    queries: QueryClient,
    storage: PendingStorage,
    online?: () => boolean,
  ) {
    super(
      session,
      queries,
      storage,
      { key: PENDING_ADJUSTMENT_KEY, kinds: ['STOCK_ADJUST'] },
      { kind: 'READY', message: '' },
      { kind: 'UNCERTAIN', message: 'Estamos comprobando el ajuste anterior.' },
      online,
    );
    this.reconcile();
  }
  savedDraft(scope: CommandScope) {
    return this.draftScope?.generation === scope.generation &&
      this.draftScope.inventoryId === scope.inventoryId &&
      this.draftScope.businessId === scope.businessId
      ? this.draft
      : { form: initialAdjustmentForm(), selected: null };
  }
  saveDraft(
    scope: CommandScope,
    form: AdjustmentForm,
    selected: ProductReadDto | null,
  ) {
    const current = commandScope(this.session);
    if (
      !current ||
      current.generation !== scope.generation ||
      current.inventoryId !== scope.inventoryId ||
      current.businessId !== scope.businessId ||
      this.busy ||
      this.intent ||
      this.descriptor ||
      this.view.kind === 'ACCEPTED'
    )
      return;
    this.draftScope = scope;
    this.draft = { form: { ...form }, selected };
    this.review = undefined;
    if (this.view.kind === 'WARNING')
      this.publish({ kind: 'READY', message: '' });
  }
  routeChanged(pathname: string) {
    if (pathname !== '/adjustments/new' && !this.intent && !this.descriptor)
      this.reset();
  }
  protected override reset() {
    this.review = undefined;
    this.result = undefined;
    this.draftScope = undefined;
    this.draft = { form: initialAdjustmentForm(), selected: null };
    super.reset();
  }
  protected override reconcile() {
    const scope = commandScope(this.session);
    if (
      scope &&
      this.draftScope &&
      (scope.generation !== this.draftScope.generation ||
        scope.businessId !== this.draftScope.businessId ||
        scope.inventoryId !== this.draftScope.inventoryId)
    )
      this.reset();
    super.reconcile();
  }
  protected transient(
    kind: 'SENDING' | 'UNCERTAIN' | 'CHECKING',
    message: string,
    canRetry?: boolean,
  ): AdjustmentView {
    return {
      kind,
      message: kind === 'SENDING' ? 'Registrando ajuste…' : message,
      canRetry,
    };
  }
  protected async sendCommand(
    scope: CommandScope,
    command: AdjustStockCommand,
    signal: AbortSignal,
    beforeSend: () => void,
  ) {
    const epoch = this.epoch,
      result = await this.client.register(
        scope.inventoryId,
        command,
        signal,
        beforeSend,
      );
    if (this.current(epoch, scope) && !signal.aborted) this.result = result;
    return result;
  }
  protected readReceipt(scope: CommandScope, id: string, signal: AbortSignal) {
    return this.products.client.receipt(scope.inventoryId, id, signal);
  }
  protected errorMessage(error: unknown) {
    return adjustmentErrorMessage(error);
  }
  async prepare(form: AdjustmentForm) {
    if (!this.canStart()) return;
    await this.freshReview({ ...form }, false);
  }
  async confirm() {
    if (!this.canStart() || !this.review) return;
    await this.freshReview({ ...this.review.form }, true);
  }
  private async freshReview(form: AdjustmentForm, confirm: boolean) {
    const scope = commandScope(this.session);
    if (!scope || !this.online()) {
      this.publish({
        kind: 'ERROR',
        message:
          'Necesitas conexión y acceso al inventario para revisar el conteo.',
      });
      return;
    }
    const previous = this.review;
    this.busy = true;
    this.draftScope = scope;
    const epoch = ++this.epoch,
      request = new AbortController();
    this.request = request;
    this.publish({
      kind: 'PREPARING',
      message: 'Comprobando el inventario actual…',
    });
    try {
      if (!form.productId)
        throw new AdjustmentInputError('productId', 'Selecciona un producto.');
      physicalCount(form.actualStock);
      const read = await this.products.client.detail(
        scope.inventoryId,
        form.productId,
        request.signal,
      );
      if (!this.current(epoch, scope)) return;
      this.review = undefined;
      this.draft = { form, selected: read };
      if (!read) {
        this.publish({
          kind: 'ERROR',
          message: 'Producto no disponible.',
          refreshed: null,
        });
        return;
      }
      const preview = adjustmentPreview(form, read);
      if (preview.difference === 0) {
        this.publish({
          kind: 'ERROR',
          message: 'El stock registrado ya coincide con el conteo físico.',
          refreshed: read,
          observedStock: previous?.read.state.stock,
        });
        return;
      }
      this.review = { form, read, preview };
      const changed =
        !previous ||
        JSON.stringify(previous.read.state) !== JSON.stringify(read.state) ||
        JSON.stringify(previous.preview) !== JSON.stringify(preview);
      if (!confirm || changed) {
        this.publish({
          kind: 'WARNING',
          message: confirm
            ? 'El estado del producto cambió. Revisa el conteo actualizado antes de confirmar.'
            : 'Revisa el conteo antes de confirmar el ajuste.',
          review: this.review,
          refreshed: read,
          observedStock: previous?.read.state.stock,
        });
        return;
      }
      this.intent = buildAdjustment(form, read);
      this.review = undefined;
      await this.send(scope);
    } catch (error) {
      if (!this.current(epoch, scope)) return;
      this.review = undefined;
      this.session.handleBusinessError(error);
      if (this.current(epoch, scope))
        this.publish({
          kind: 'ERROR',
          message:
            error instanceof AdjustmentInputError
              ? error.message
              : adjustmentErrorMessage(error),
          refreshed: this.draft.selected,
          ...(error instanceof AdjustmentInputError
            ? { field: error.field }
            : {}),
        });
    } finally {
      if (epoch === this.epoch) this.busy = false;
    }
  }
  protected async accepted(
    scope: CommandScope,
    epoch: number,
    recovered: boolean,
    _descriptor: PendingCommand<'STOCK_ADJUST'>,
    receipt?: AcceptedReceipt,
  ) {
    const result = receipt
      ? recoverAdjustment(receipt, scope.inventoryId, this.intent ?? undefined)
      : this.result;
    if (!result) throw new ApiClientError('INVALID_JSON', 200);
    this.clearIntent();
    this.review = undefined;
    await this.queries.invalidateQueries({ queryKey: productsKey(scope) });
    if (this.current(epoch, scope))
      this.publish({
        kind: 'ACCEPTED',
        message: recovered
          ? 'El ajuste anterior sí fue registrado.'
          : 'Stock actualizado',
        result,
        recovered,
      });
  }
  protected async terminal(
    error: unknown,
    scope: CommandScope,
    epoch: number,
    started: boolean,
  ) {
    const id = this.intent?.payload.productId,
      observedStock = this.intent?.preconditions.expectedState.stock;
    this.clearIntent();
    this.review = undefined;
    this.result = undefined;
    const message = started
      ? adjustmentErrorMessage(error)
      : 'No pudimos preparar el envío. El ajuste no fue enviado; vuelve a revisarlo.';
    if (
      started &&
      id &&
      error instanceof ApiClientError &&
      (error.status === 404 ||
        error.apiError?.error.code === 'REVISION_CONFLICT')
    ) {
      await this.queries.invalidateQueries({
        queryKey: productsKey(scope),
        refetchType: 'none',
      });
      try {
        const refreshed = await this.products.client.detail(
          scope.inventoryId,
          id,
          this.request!.signal,
        );
        if (this.current(epoch, scope)) {
          this.draft = { ...this.draft, selected: refreshed };
          this.publish({ kind: 'ERROR', message, refreshed, observedStock });
        }
      } catch (refreshError) {
        if (!this.current(epoch, scope)) return;
        this.session.handleBusinessError(refreshError);
        if (this.current(epoch, scope))
          this.publish({
            kind: 'ERROR',
            message: `${message} ${adjustmentErrorMessage(refreshError)}`,
            observedStock,
          });
      }
    } else this.publish({ kind: 'ERROR', message });
  }
  protected async receiptTerminal(
    receipt: TerminalReceipt,
    scope: CommandScope,
    epoch: number,
    _descriptor: PendingCommand<'STOCK_ADJUST'>,
  ) {
    if (this.intent) {
      await this.terminal(
        new ApiClientError(
          'HTTP',
          receipt.status === 'CONFLICT'
            ? 409
            : receipt.error.code === 'NOT_FOUND'
              ? 404
              : 422,
          { error: receipt.error },
        ),
        scope,
        epoch,
        true,
      );
      return;
    }
    this.clearIntent();
    this.review = undefined;
    await this.queries.invalidateQueries({ queryKey: productsKey(scope) });
    if (this.current(epoch, scope))
      this.publish({
        kind: 'ERROR',
        message:
          'El ajuste anterior no fue aceptado. Revisa el producto y realiza una nueva acción.',
      });
  }
  override acknowledge() {
    if (this.view.kind === 'ACCEPTED') this.reset();
  }
}
export function adjustmentErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.apiError?.error.code === 'REVISION_CONFLICT')
      return 'El stock del producto cambió desde que revisaste el conteo. Comprueba las cantidades antes de confirmar nuevamente.';
    if (error.status === 404) return 'Producto no disponible.';
    if (error.status === 422)
      return 'No pudimos registrar el ajuste. Revisa si el stock ya coincide con tu conteo y comprueba el motivo y el costo.';
  }
  return productErrorMessage(error);
}
