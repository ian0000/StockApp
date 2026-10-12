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
import { productsKey } from '../products/controller.js';
import { salesKey } from '../sales/controller.js';
import { purchasesKey } from '../purchases/controller.js';
import { invalidateCommercialReads } from '../reads/queries.js';
import {
  buildVoid,
  operation,
  productIds,
  eligibilityMessage,
  sameReview,
  type VoidReview,
  type VoidKind,
  type VoidCommand,
} from './input.js';
import {
  recoverVoid,
  resultId,
  type VoidResult,
  type VoidsClient,
} from './client.js';
export const PENDING_SALE_VOID_KEY = 'stockapp.pending-sale-void';
export const PENDING_PURCHASE_VOID_KEY = 'stockapp.pending-purchase-void';
export type VoidView = CommandView & {
  review?: VoidReview;
  result?: VoidResult;
  recovered?: boolean;
};
export function voidErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 409)
      return 'El inventario cambió. Revisa la operación y confirma nuevamente si todavía puede anularse.';
    if (
      error.status === 422 &&
      error.apiError?.error.code === 'VOID_NOT_ELIGIBLE'
    )
      return 'Esta operación ya no puede anularse. Consulta su estado y los movimientos posteriores.';
    if (error.status === 404) return 'Operación o producto no disponible.';
    if (error.status === 401)
      return 'Tu sesión caducó. Vuelve a iniciar sesión.';
    if (error.status === 403) return 'No tienes acceso a este inventario.';
    if (error.status === 429)
      return 'Demasiados intentos. Espera un momento y revisa la operación.';
  }
  return 'No pudimos completar la anulación. Revisa la operación antes de continuar.';
}
export class VoidController extends ScopedCommandController<
  VoidCommand,
  VoidView
> {
  private review?: VoidReview;
  private result?: VoidResult;
  private draftScope?: CommandScope;
  private targetId?: string;
  constructor(
    readonly kind: VoidKind,
    readonly client: VoidsClient,
    session: SessionController,
    queries: QueryClient,
    storage: PendingStorage,
    online?: () => boolean,
  ) {
    super(
      session,
      queries,
      storage,
      {
        key:
          kind === 'SALE_VOID'
            ? PENDING_SALE_VOID_KEY
            : PENDING_PURCHASE_VOID_KEY,
        kinds: [kind],
      },
      { kind: 'READY', message: '' },
      {
        kind: 'UNCERTAIN',
        message: 'No pudimos confirmar la anulación anterior.',
      },
      online,
    );
    this.reconcile();
  }
  protected override current(epoch: number, scope: CommandScope) {
    const now = commandScope(this.session),
      view = this.session.snapshot(),
      meta = 'me' in view ? view.me : undefined;
    return (
      super.current(epoch, scope) &&
      (!meta ||
        (meta.business?.id === scope.businessId &&
          meta.inventory?.id === scope.inventoryId)) &&
      (!now ||
        (now.businessId === scope.businessId &&
          now.inventoryId === scope.inventoryId))
    );
  }
  protected override reset() {
    this.review = undefined;
    this.result = undefined;
    this.draftScope = undefined;
    this.targetId = undefined;
    super.reset();
  }
  protected override reconcile() {
    const view = this.session.snapshot(),
      meta = 'me' in view ? view.me : undefined,
      old = this.draftScope;
    if (
      meta &&
      ((old &&
        (view.generation !== old.generation ||
          meta.business?.id !== old.businessId ||
          meta.inventory?.id !== old.inventoryId)) ||
        (this.descriptor &&
          meta.inventory?.id.toLowerCase() !==
            this.descriptor.inventoryId.toLowerCase()))
    )
      this.reset();
    super.reconcile();
  }
  routeChanged(pathname: string) {
    const expected =
      this.targetId &&
      `/${this.kind === 'SALE_VOID' ? 'sales' : 'purchases'}/${this.targetId}`;
    if (
      expected &&
      pathname.toLowerCase() !== expected.toLowerCase() &&
      !this.intent &&
      !this.descriptor
    )
      this.reset();
  }
  cancel() {
    if (!this.busy && !this.intent && !this.descriptor) this.reset();
  }
  protected transient(
    kind: 'SENDING' | 'UNCERTAIN' | 'CHECKING',
    message: string,
    canRetry?: boolean,
  ): VoidView {
    return {
      kind,
      canRetry,
      message:
        kind === 'SENDING'
          ? 'Anulando…'
          : kind === 'CHECKING'
            ? 'Estamos comprobando la anulación anterior.'
            : 'No pudimos confirmar la anulación anterior. Comprueba el estado antes de crear otra intención.',
    };
  }
  protected async sendCommand(
    scope: CommandScope,
    command: VoidCommand,
    signal: AbortSignal,
    beforeSend: () => void,
  ) {
    const epoch = this.epoch,
      result = await this.client.send(
        scope.inventoryId,
        command,
        this.review,
        signal,
        beforeSend,
      );
    if (this.current(epoch, scope) && !signal.aborted) this.result = result;
    return result;
  }
  protected readReceipt(scope: CommandScope, id: string, signal: AbortSignal) {
    return this.client.receipt(scope.inventoryId, id, signal);
  }
  protected errorMessage = voidErrorMessage;
  override async check() {
    if (this.online()) await super.check();
  }
  async prepare(id: string) {
    if (this.canStart()) await this.fresh(id, false);
  }
  async confirm() {
    if (this.canStart() && this.review)
      await this.fresh(operation(this.review).id, true);
  }
  private async fresh(id: string, confirm: boolean) {
    const scope = commandScope(this.session);
    if (!scope || !this.online()) {
      this.publish({
        kind: 'ERROR',
        message: 'Necesitas conexión y acceso al inventario para anular.',
      });
      return;
    }
    const previous = this.review;
    this.busy = true;
    this.draftScope = scope;
    this.targetId = id;
    const epoch = ++this.epoch,
      request = new AbortController();
    this.request = request;
    this.publish({
      kind: 'PREPARING',
      message: 'Comprobando la operación y el inventario actual…',
    });
    try {
      const detail = await this.client.detail(
        scope.inventoryId,
        this.kind,
        id,
        request.signal,
      );
      if (!this.current(epoch, scope)) return;
      this.review = undefined;
      if (!detail) {
        this.publish({ kind: 'ERROR', message: 'Operación no disponible.' });
        return;
      }
      if (
        operation(detail).status !== 'CONFIRMED' ||
        !detail.detail.voidEligibility.eligible
      ) {
        await this.refetchDetail(scope, id);
        if (this.current(epoch, scope))
          this.publish({ kind: 'ERROR', message: eligibilityMessage(detail) });
        return;
      }
      const ids = productIds(detail);
      if (
        !ids.length ||
        new Set(ids.map((id) => id.toLowerCase())).size !== ids.length
      )
        throw new ApiClientError('INVALID_JSON', 200);
      const states = [];
      for (const productId of ids)
        states.push(
          await this.client.state(scope.inventoryId, productId, request.signal),
        );
      if (!this.current(epoch, scope)) return;
      this.review = { ...detail, states };
      if (!confirm || !previous || !sameReview(previous, this.review)) {
        this.publish({
          kind: 'WARNING',
          review: this.review,
          message: confirm
            ? 'El estado cambió. Revisa la información actualizada y confirma de nuevo.'
            : 'Revisa la operación antes de confirmar la anulación.',
        });
        return;
      }
      this.intent = buildVoid(this.review);
      await this.send(scope);
    } catch (error) {
      if (!this.current(epoch, scope)) return;
      this.review = undefined;
      this.session.handleBusinessError(error);
      if (this.current(epoch, scope))
        this.publish({ kind: 'ERROR', message: voidErrorMessage(error) });
    } finally {
      if (epoch === this.epoch) this.busy = false;
    }
  }
  private refetchDetail(scope: CommandScope, id: string) {
    return this.queries.invalidateQueries({
      queryKey:
        this.kind === 'SALE_VOID'
          ? salesKey(scope, 'detail', id.toLowerCase())
          : purchasesKey(scope, 'detail', id.toLowerCase()),
    });
  }
  protected async accepted(
    scope: CommandScope,
    epoch: number,
    recovered: boolean,
    _descriptor: PendingCommand<VoidKind>,
    receipt?: AcceptedReceipt,
  ) {
    const result = receipt
      ? recoverVoid(
          receipt,
          scope.inventoryId,
          this.kind,
          this.intent ?? undefined,
          this.review,
        )
      : this.result;
    if (!result) throw new ApiClientError('INVALID_JSON', 200);
    this.clearIntent();
    this.review = undefined;
    await this.refetchDetail(scope, resultId(result));
    await this.queries.invalidateQueries({ queryKey: productsKey(scope) });
    await invalidateCommercialReads(this.queries, scope);
    if (this.current(epoch, scope))
      this.publish({
        kind: 'ACCEPTED',
        result,
        recovered,
        message: recovered
          ? 'La anulación anterior sí se registró.'
          : this.kind === 'SALE_VOID'
            ? 'Venta anulada.'
            : 'Compra anulada.',
      });
  }
  protected async terminal(
    error: unknown,
    scope: CommandScope,
    epoch: number,
    _started: boolean,
  ) {
    const id = this.intent
      ? this.intent.commandKind === 'SALE_VOID'
        ? this.intent.payload.saleId
        : this.intent.payload.purchaseId
      : this.review
        ? operation(this.review).id
        : undefined;
    this.clearIntent();
    this.review = undefined;
    if (id) await this.refetchDetail(scope, id);
    if (this.current(epoch, scope))
      this.publish({
        kind:
          error instanceof ApiClientError && error.status === 409
            ? 'CONFLICT'
            : 'ERROR',
        message: voidErrorMessage(error),
      });
  }
  protected async receiptTerminal(
    receipt: TerminalReceipt,
    scope: CommandScope,
    epoch: number,
    _descriptor: PendingCommand<VoidKind>,
  ) {
    this.clearIntent();
    this.review = undefined;
    // A reload descriptor deliberately has no operation entity ID; refetch only own detail queries.
    await this.queries.invalidateQueries({
      queryKey:
        this.kind === 'SALE_VOID'
          ? salesKey(scope, 'detail')
          : purchasesKey(scope, 'detail'),
    });
    if (this.current(epoch, scope))
      this.publish({
        kind: receipt.status === 'CONFLICT' ? 'CONFLICT' : 'ERROR',
        message:
          receipt.status === 'CONFLICT'
            ? 'El inventario cambió. Revisa y confirma nuevamente si todavía es posible anular.'
            : 'La anulación anterior fue rechazada. Revisa la operación antes de continuar.',
      });
  }
}
