import type {
  RegisterPurchaseCommand,
  RegisterPurchaseCommandResult,
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
import {
  commandScope,
  scopedKey,
  type CommandScope,
} from '../commands/scope.js';
import type { PendingCommand, PendingStorage } from '../commands/pending.js';
import {
  productsKey,
  productErrorMessage,
  type ProductsController,
} from '../products/controller.js';
import { recoverPurchase, type PurchasesClient } from './client.js';
import {
  buildPurchase,
  purchaseTotal,
  initialMargin,
  initialPurchaseForm,
  priceUpdateDraft,
  PurchaseInputError,
  type PurchaseForm,
  type MarginDraft,
} from './input.js';
export const PENDING_PURCHASE_KEY = 'stockapp.pending-purchase';
export const purchasesKey = (scope: CommandScope, ...parts: string[]) =>
  scopedKey(scope, 'purchases', ...parts);
type Confirmation = {
  result: RegisterPurchaseCommandResult;
  margin: MarginDraft;
  decision:
    | 'pending'
    | 'saving'
    | 'uncertain'
    | 'applied'
    | 'kept'
    | 'error'
    | 'conflict';
  priceMessage: string;
};
export type PurchaseView = CommandView & {
  purchaseId?: string;
  refreshed?: ProductReadDto | null;
  confirmation?: Confirmation;
  field?: PurchaseInputError['field'];
};
export class PurchasesController extends ScopedCommandController<
  RegisterPurchaseCommand,
  PurchaseView
> {
  private result?: RegisterPurchaseCommandResult;
  private preparedScope?: CommandScope;
  private ownPrice = false;
  private draftScope?: CommandScope;
  private draft: { form: PurchaseForm; selected: ProductReadDto | null } = {
    form: initialPurchaseForm(),
    selected: null,
  };
  savedDraft(scope: CommandScope) {
    return this.draftScope?.generation === scope.generation &&
      this.draftScope.businessId === scope.businessId &&
      this.draftScope.inventoryId === scope.inventoryId
      ? this.draft
      : { form: initialPurchaseForm(), selected: null };
  }
  saveDraft(
    scope: CommandScope,
    form: PurchaseForm,
    selected: ProductReadDto | null,
  ) {
    const current = commandScope(this.session);
    if (
      current &&
      current.generation === scope.generation &&
      current.inventoryId === scope.inventoryId &&
      current.businessId === scope.businessId
    ) {
      this.draftScope = scope;
      this.draft = { form, selected };
    }
  }
  routeChanged(pathname: string) {
    if (
      pathname !== '/purchases/new' &&
      !this.ownPrice &&
      !this.intent &&
      !this.descriptor
    ) {
      this.draft = { form: initialPurchaseForm(), selected: null };
      this.draftScope = undefined;
      this.leaveConfirmation();
    }
  }
  private unsubscribePrice: () => void;
  protected override reset() {
    this.draftScope = undefined;
    this.draft = { form: initialPurchaseForm(), selected: null };
    this.result = undefined;
    this.preparedScope = undefined;
    this.ownPrice = false;
    super.reset();
  }
  protected override reconcile() {
    const scope = commandScope(this.session);
    if (
      scope &&
      this.preparedScope &&
      (scope.generation !== this.preparedScope.generation ||
        scope.businessId !== this.preparedScope.businessId ||
        scope.inventoryId !== this.preparedScope.inventoryId)
    )
      this.reset();
    super.reconcile();
  }
  constructor(
    readonly client: PurchasesClient,
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
      { key: PENDING_PURCHASE_KEY, kinds: ['PURCHASE_REGISTER'] },
      { kind: 'READY', message: '' },
      { kind: 'UNCERTAIN', message: 'Estamos comprobando la compra anterior.' },
      online,
    );
    this.unsubscribePrice = products.subscribe(() => this.priceChanged());
    this.reconcile();
  }
  protected transient(
    kind: 'SENDING' | 'UNCERTAIN' | 'CHECKING',
    message: string,
    canRetry?: boolean,
  ): PurchaseView {
    return {
      kind,
      message: kind === 'SENDING' ? 'Registrando compra…' : message,
      canRetry,
    };
  }
  protected async sendCommand(
    scope: CommandScope,
    command: RegisterPurchaseCommand,
    signal: AbortSignal,
    beforeSend: () => void,
  ) {
    const epoch = this.epoch;
    const result = await this.client.register(
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
    return purchaseErrorMessage(error);
  }
  async prepare(form: PurchaseForm) {
    if (!this.canStart()) return;
    const scope = commandScope(this.session);
    if (!scope || !this.online()) {
      this.publish({
        kind: 'ERROR',
        message:
          'Necesitas conexión y acceso al inventario para registrar la compra.',
      });
      return;
    }
    this.busy = true;
    this.preparedScope = scope;
    this.result = undefined;
    const epoch = ++this.epoch,
      request = new AbortController();
    this.request = request;
    this.publish({
      kind: 'PREPARING',
      message: 'Comprobando el inventario actual…',
    });
    try {
      if (!form.productId)
        throw new PurchaseInputError('productId', 'Selecciona un producto.');
      purchaseTotal(form);
      const read = await this.products.client.detail(
        scope.inventoryId,
        form.productId,
        request.signal,
      );
      if (!this.current(epoch, scope)) return;
      if (!read) {
        this.publish({
          kind: 'ERROR',
          message: 'Producto no disponible.',
          refreshed: null,
        });
        return;
      }
      this.intent = buildPurchase(form, read);
      await this.send(scope);
    } catch (error) {
      if (!this.current(epoch, scope)) return;
      this.session.handleBusinessError(error);
      if (this.current(epoch, scope))
        this.publish({
          kind: 'ERROR',
          message:
            error instanceof PurchaseInputError
              ? error.message
              : purchaseErrorMessage(error),
          ...(error instanceof PurchaseInputError
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
    _descriptor: PendingCommand<'PURCHASE_REGISTER'>,
    receipt?: AcceptedReceipt,
  ) {
    const purchaseId = receipt
      ? recoverPurchase(receipt, scope.inventoryId, this.intent ?? undefined)
      : this.result?.purchase.id;
    if (!purchaseId) throw new ApiClientError('INVALID_JSON', 200);
    const result = receipt ? undefined : this.result;
    this.clearIntent();
    await this.queries.invalidateQueries({ queryKey: productsKey(scope) });
    await this.queries.invalidateQueries({
      queryKey: purchasesKey(scope, 'detail', purchaseId.toLowerCase()),
    });
    if (this.current(epoch, scope))
      this.publish({
        kind: 'ACCEPTED',
        purchaseId,
        message: recovered
          ? 'La compra anterior sí fue registrada.'
          : 'Compra registrada.',
        ...(result
          ? {
              confirmation: {
                result,
                margin: initialMargin(result.priceAnalysis),
                decision: 'pending',
                priceMessage: '',
              },
            }
          : {}),
      });
  }
  private async refreshTerminal(
    scope: CommandScope,
    epoch: number,
    id: string | undefined,
    message: string,
  ) {
    this.clearIntent();
    this.result = undefined;
    await this.queries.invalidateQueries({
      queryKey: productsKey(scope),
      refetchType: 'none',
    });
    if (!id) {
      if (this.current(epoch, scope)) this.publish({ kind: 'ERROR', message });
      return;
    }
    this.publish({ kind: 'PREPARING', message });
    try {
      const refreshed = await this.products.client.detail(
        scope.inventoryId,
        id,
        this.request!.signal,
      );
      if (this.current(epoch, scope))
        this.publish({ kind: 'ERROR', message, refreshed });
    } catch (error) {
      if (!this.current(epoch, scope)) return;
      this.session.handleBusinessError(error);
      if (this.current(epoch, scope))
        this.publish({
          kind: 'ERROR',
          message: `${message} ${purchaseErrorMessage(error)}`,
        });
    }
  }
  protected async terminal(
    error: unknown,
    scope: CommandScope,
    epoch: number,
    started: boolean,
  ) {
    if (
      started &&
      error instanceof ApiClientError &&
      (error.status === 404 ||
        error.apiError?.error.code === 'REVISION_CONFLICT')
    ) {
      await this.refreshTerminal(
        scope,
        epoch,
        this.intent?.payload.productId,
        purchaseErrorMessage(error),
      );
      return;
    }
    this.clearIntent();
    this.result = undefined;
    this.publish({
      kind: 'ERROR',
      message: started
        ? purchaseErrorMessage(error)
        : 'No pudimos preparar el envío. La compra no fue enviada; vuelve a intentarlo.',
    });
  }
  protected async receiptTerminal(
    receipt: TerminalReceipt,
    scope: CommandScope,
    epoch: number,
    _descriptor: PendingCommand<'PURCHASE_REGISTER'>,
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
    await this.refreshTerminal(
      scope,
      epoch,
      undefined,
      'La compra anterior no fue registrada. Revisa los datos antes de intentarlo de nuevo.',
    );
  }
  editMargin(text: string) {
    const c = this.view.confirmation;
    if (c && !this.ownPrice && c.decision === 'pending')
      this.publish({
        ...this.view,
        confirmation: { ...c, margin: { text, dirty: true } },
      });
  }
  keepPrice() {
    const c = this.view.confirmation;
    if (c && !this.ownPrice)
      this.publish({
        ...this.view,
        confirmation: {
          ...c,
          decision: 'kept',
          priceMessage: 'Precio de venta habitual conservado.',
        },
      });
  }
  async applyPrice() {
    const c = this.view.confirmation;
    if (
      !c ||
      c.decision !== 'pending' ||
      this.ownPrice ||
      !this.online() ||
      !commandScope(this.session)
    )
      return;
    if (!['READY', 'ERROR'].includes(this.products.snapshot().kind)) {
      this.publish({
        ...this.view,
        confirmation: {
          ...c,
          priceMessage:
            'Resuelve el cambio de producto pendiente antes de actualizar el precio.',
        },
      });
      return;
    }
    const draft = priceUpdateDraft(c.result, c.margin);
    if (!draft) return;
    this.ownPrice = true;
    this.publish({
      ...this.view,
      confirmation: {
        ...c,
        decision: 'saving',
        priceMessage:
          'La compra está registrada. Guardando el cambio de precio…',
      },
    });
    await this.products.update(draft);
  }
  private priceChanged() {
    const c = this.view.confirmation;
    if (!c || !this.ownPrice) return;
    const p = this.products.snapshot();
    const decision =
      p.kind === 'ACCEPTED'
        ? 'applied'
        : p.kind === 'CONFLICT'
          ? 'conflict'
          : p.kind === 'ERROR'
            ? 'error'
            : p.kind === 'UNCERTAIN'
              ? 'uncertain'
              : 'saving';
    const priceMessage =
      decision === 'applied'
        ? 'Precio de venta habitual actualizado.'
        : decision === 'conflict'
          ? 'El producto cambió después de registrar la compra. Revisa el producto antes de actualizar su precio.'
          : decision === 'error'
            ? 'La compra está registrada, pero no pudimos actualizar el precio.'
            : 'La compra está registrada. Estamos comprobando el cambio de precio.';
    this.publish({
      ...this.view,
      confirmation: { ...c, decision, priceMessage },
    });
    if (['applied', 'conflict', 'error'].includes(decision)) {
      this.ownPrice = false;
      if (decision === 'applied') this.products.acknowledge();
    }
  }
  leaveConfirmation() {
    if (!this.ownPrice) {
      this.draftScope = undefined;
      this.draft = { form: initialPurchaseForm(), selected: null };
      this.result = undefined;
      this.acknowledge();
    }
  }
  discardPrice() {
    const c = this.view.confirmation;
    if (c && c.decision === 'uncertain') {
      this.ownPrice = false;
      this.products.discard();
      this.publish({
        ...this.view,
        confirmation: {
          ...c,
          decision: 'error',
          priceMessage:
            'La compra está registrada. No pudimos confirmar el cambio de precio anterior.',
        },
      });
    }
  }
  override dispose() {
    this.unsubscribePrice();
    super.dispose();
  }
}
export function purchaseErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.apiError?.error.code === 'REVISION_CONFLICT')
      return 'El inventario cambió desde que revisaste esta compra. Revisa los datos y confirma nuevamente.';
    if (error.status === 404) return 'Producto no disponible.';
    if (error.status === 400 || error.status === 422)
      return 'No pudimos registrar la compra con esos datos. Revisa la cantidad y el costo.';
  }
  return productErrorMessage(error);
}
