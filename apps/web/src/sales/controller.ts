import type { RegisterSaleCommand, ProductReadDto } from '@stock-app/contracts';
import type { QueryClient } from '@tanstack/react-query';
import { SessionController } from '../auth/session.js';
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
import {
  type PendingCommand,
  type PendingStorage,
} from '../commands/pending.js';
import { productsKey, productErrorMessage } from '../products/controller.js';
import type { ProductsClient } from '../products/client.js';
import { recoverSale, type SalesClient } from './client.js';
import {
  prepareSale,
  cartTotal,
  type CartLine,
  type StockWarning,
} from './cart.js';
export const PENDING_SALE_KEY = 'stockapp.pending-sale';
export const salesKey = (scope: CommandScope, ...parts: string[]) =>
  scopedKey(scope, 'sales', ...parts);
export type SaleView = CommandView & {
  saleId?: string;
  warnings?: StockWarning[];
  unavailable?: string[];
  refreshed?: ProductReadDto[];
};
export function saleErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.apiError?.error.code === 'COST_SNAPSHOT_CONFLICT')
      return 'El costo del inventario cambió. Revisa la venta y confirma nuevamente.';
    if (error.status === 404)
      return 'Producto no disponible. Revisa los productos de la venta.';
    if (error.status === 422 || error.status === 400)
      return 'No pudimos registrar la venta con esos datos. Revisa los precios y las cantidades.';
  }
  return productErrorMessage(error);
}
export class SalesController extends ScopedCommandController<
  RegisterSaleCommand,
  SaleView
> {
  private preparedScope?: CommandScope;
  protected override reset() {
    this.preparedScope = undefined;
    super.reset();
  }
  protected override reconcile() {
    const scope = commandScope(this.session);
    if (
      scope &&
      this.preparedScope &&
      (scope.businessId !== this.preparedScope.businessId ||
        scope.inventoryId !== this.preparedScope.inventoryId ||
        scope.generation !== this.preparedScope.generation)
    )
      this.reset();
    super.reconcile();
  }
  constructor(
    readonly client: SalesClient,
    readonly products: ProductsClient,
    session: SessionController,
    queries: QueryClient,
    storage: PendingStorage,
    online?: () => boolean,
  ) {
    super(
      session,
      queries,
      storage,
      { key: PENDING_SALE_KEY, kinds: ['SALE_REGISTER'] },
      { kind: 'READY', message: '' },
      { kind: 'UNCERTAIN', message: 'Estamos comprobando la venta anterior.' },
      online,
    );
    this.reconcile();
  }
  protected transient(
    kind: 'SENDING' | 'UNCERTAIN' | 'CHECKING',
    message: string,
    canRetry?: boolean,
  ): SaleView {
    return { kind, message, canRetry };
  }
  protected sendCommand(
    scope: CommandScope,
    command: RegisterSaleCommand,
    signal: AbortSignal,
    beforeSend: () => void,
  ) {
    return this.client.register(scope.inventoryId, command, signal, beforeSend);
  }
  protected readReceipt(scope: CommandScope, id: string, signal: AbortSignal) {
    return this.products.receipt(scope.inventoryId, id, signal);
  }
  protected errorMessage(error: unknown) {
    return saleErrorMessage(error);
  }
  async prepare(cart: readonly CartLine[]) {
    if (!this.canStart()) return;
    const scope = commandScope(this.session);
    if (!scope || !this.online()) {
      this.publish({
        kind: 'ERROR',
        message:
          'Necesitas conexión y acceso al inventario para registrar la venta.',
      });
      return;
    }
    this.preparedScope = scope;
    this.busy = true;
    const epoch = ++this.epoch,
      request = new AbortController();
    this.request = request;
    this.publish({
      kind: 'PREPARING',
      message: 'Comprobando los productos y el costo actual…',
    });
    try {
      if (!cart.length) throw new Error('Agrega un producto a la venta.');
      cartTotal(cart);
      const reads = await Promise.all(
        cart.map((line) =>
          this.products.detail(
            scope.inventoryId,
            line.productId,
            request.signal,
          ),
        ),
      );
      if (!this.current(epoch, scope)) return;
      const unavailable = cart
        .filter((_, index) => reads[index] === null)
        .map((line) => line.productId);
      const refreshed = reads.filter((p): p is ProductReadDto => p !== null);
      if (unavailable.length) {
        this.publish({
          kind: 'ERROR',
          message: 'Producto no disponible.',
          unavailable,
          refreshed,
        });
        return;
      }
      const { command, warnings } = prepareSale(cart, refreshed);
      this.intent = command;
      if (warnings.length)
        this.publish({
          kind: 'WARNING',
          message: 'Stock registrado insuficiente.',
          warnings,
          refreshed,
        });
      else await this.send(scope);
    } catch (error) {
      if (!this.current(epoch, scope)) return;
      this.session.handleBusinessError(error);
      if (this.current(epoch, scope))
        this.publish({
          kind: 'ERROR',
          message:
            error instanceof ApiClientError
              ? saleErrorMessage(error)
              : 'Revisa el carrito: usa cantidades y precios válidos, sin superar los importes permitidos.',
        });
    } finally {
      if (epoch === this.epoch) this.busy = false;
    }
  }
  async continuePrepared() {
    const scope = commandScope(this.session);
    if (
      scope &&
      this.intent &&
      !this.busy &&
      this.online() &&
      this.view.kind === 'WARNING'
    )
      await this.send(scope);
  }
  reviewQuantities() {
    if (!this.busy && this.view.kind === 'WARNING') {
      this.clearIntent();
      this.publish({ kind: 'READY', message: '' });
    }
  }
  cartEdited() {
    if (this.view.kind === 'WARNING') this.reviewQuantities();
  }
  protected async accepted(
    scope: CommandScope,
    epoch: number,
    recovered: boolean,
    _descriptor: PendingCommand<'SALE_REGISTER'>,
    receipt?: AcceptedReceipt,
  ) {
    const saleId = receipt
      ? recoverSale(receipt, scope.inventoryId, this.intent ?? undefined)
      : this.intent?.payload.saleId;
    if (!saleId) throw new ApiClientError('INVALID_JSON', 200);
    this.clearIntent();
    await this.queries.invalidateQueries({ queryKey: productsKey(scope) });
    await this.queries.invalidateQueries({
      queryKey: salesKey(scope, 'detail', saleId.toLowerCase()),
    });
    if (this.current(epoch, scope))
      this.publish({
        kind: 'ACCEPTED',
        saleId,
        message: recovered
          ? 'La venta anterior sí fue registrada.'
          : 'Venta registrada.',
      });
  }
  private async refreshTerminal(
    scope: CommandScope,
    epoch: number,
    ids: readonly string[],
    message: string,
  ) {
    this.clearIntent();
    await this.queries.invalidateQueries({
      queryKey: productsKey(scope),
      refetchType: 'none',
    });
    if (!ids.length) {
      if (this.current(epoch, scope)) this.publish({ kind: 'ERROR', message });
      return;
    }
    this.publish({ kind: 'PREPARING', message });
    try {
      const reads = await Promise.all(
        ids.map((id) =>
          this.products.detail(scope.inventoryId, id, this.request!.signal),
        ),
      );
      if (this.current(epoch, scope))
        this.publish({
          kind: 'ERROR',
          message,
          unavailable: ids.filter((_, i) => reads[i] === null),
          refreshed: reads.filter((p): p is ProductReadDto => p !== null),
        });
    } catch (error) {
      if (!this.current(epoch, scope)) return;
      this.session.handleBusinessError(error);
      if (this.current(epoch, scope))
        this.publish({
          kind: 'ERROR',
          message: `${message} ${saleErrorMessage(error)}`,
        });
    }
  }
  protected async terminal(
    error: unknown,
    scope: CommandScope,
    epoch: number,
    started: boolean,
  ) {
    const ids = this.intent?.payload.items.map((i) => i.productId) ?? [];
    if (
      started &&
      error instanceof ApiClientError &&
      (error.apiError?.error.code === 'COST_SNAPSHOT_CONFLICT' ||
        error.status === 404)
    ) {
      await this.refreshTerminal(scope, epoch, ids, saleErrorMessage(error));
      return;
    }
    this.clearIntent();
    this.publish({
      kind: 'ERROR',
      message: started
        ? saleErrorMessage(error)
        : 'No pudimos preparar el envío. La venta no fue enviada; vuelve a intentarlo.',
    });
  }
  protected async receiptTerminal(
    receipt: TerminalReceipt,
    scope: CommandScope,
    epoch: number,
    _descriptor: PendingCommand<'SALE_REGISTER'>,
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
      [],
      'La venta anterior no fue registrada. Revisa los datos antes de intentarlo de nuevo.',
    );
  }
}
