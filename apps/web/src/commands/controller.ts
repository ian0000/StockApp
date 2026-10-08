import type { OperationReceipt } from '@stock-app/contracts';
import type { QueryClient } from '@tanstack/react-query';
import { SessionController } from '../auth/session.js';
import { ApiClientError } from '../api/client.js';
import { commandScope, type CommandScope } from './scope.js';
import {
  clearDescriptor,
  readDescriptor,
  writeDescriptor,
  type PendingCommand,
  type PendingStorage,
} from './pending.js';
export type CommandView = {
  kind:
    | 'READY'
    | 'SENDING'
    | 'UNCERTAIN'
    | 'CHECKING'
    | 'ACCEPTED'
    | 'ERROR'
    | 'CONFLICT'
    | 'PREPARING'
    | 'WARNING';
  message: string;
  canRetry?: boolean;
};
export type AcceptedReceipt = Extract<OperationReceipt, { status: 'ACCEPTED' }>;
export type TerminalReceipt = Exclude<OperationReceipt, AcceptedReceipt>;
type Intent = { operationId: string; commandKind: string };
// One lifecycle for Product and Sale; feature validation and results vary.
export abstract class ScopedCommandController<
  C extends Intent,
  V extends CommandView,
> {
  protected descriptor: PendingCommand<C['commandKind']> | null;
  protected intent: C | null = null;
  protected view: V;
  protected request?: AbortController;
  protected epoch = 0;
  protected busy = false;
  private listeners = new Set<() => void>();
  private recoveryScope: string | null = null;
  private unsubscribe: () => void;
  private unsubscribeBoundary: () => void;
  constructor(
    readonly session: SessionController,
    readonly queries: QueryClient,
    private storage: PendingStorage,
    private pending: { key: string; kinds: readonly C['commandKind'][] },
    private ready: V,
    unknown: V,
    protected online: () => boolean = () =>
      typeof navigator === 'undefined' || navigator.onLine,
  ) {
    this.descriptor = readDescriptor(storage, pending.key, pending.kinds);
    this.view = this.descriptor ? unknown : ready;
    this.unsubscribeBoundary = session.onBoundary(() => this.reset());
    this.unsubscribe = session.subscribe(() => this.reconcile());
  }
  snapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  protected publish(view: V) {
    this.view = view;
    for (const listener of this.listeners) listener();
  }
  protected clearIntent() {
    this.intent = null;
    this.descriptor = null;
    clearDescriptor(this.storage, this.pending.key);
  }
  protected reset() {
    this.request?.abort();
    this.epoch++;
    this.busy = false;
    this.clearIntent();
    this.recoveryScope = null;
    this.publish(this.ready);
  }
  protected reconcile() {
    const scope = commandScope(this.session);
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
  protected current(epoch: number, scope: CommandScope) {
    return (
      epoch === this.epoch &&
      this.session.snapshot().generation === scope.generation
    );
  }
  protected canStart() {
    return (
      !this.busy &&
      !this.descriptor &&
      !this.intent &&
      this.view.kind !== 'ACCEPTED'
    );
  }
  protected abstract transient(
    kind: 'SENDING' | 'UNCERTAIN' | 'CHECKING',
    message: string,
    canRetry?: boolean,
  ): V;
  protected abstract sendCommand(
    scope: CommandScope,
    command: C,
    signal: AbortSignal,
    beforeSend: () => void,
  ): Promise<unknown>;
  protected abstract readReceipt(
    scope: CommandScope,
    operationId: string,
    signal: AbortSignal,
  ): Promise<OperationReceipt | null>;
  protected abstract accepted(
    scope: CommandScope,
    epoch: number,
    recovered: boolean,
    descriptor: PendingCommand<C['commandKind']>,
    receipt?: AcceptedReceipt,
  ): Promise<void>;
  protected abstract terminal(
    error: unknown,
    scope: CommandScope,
    epoch: number,
    started: boolean,
  ): Promise<void>;
  protected abstract receiptTerminal(
    receipt: TerminalReceipt,
    scope: CommandScope,
    epoch: number,
    descriptor: PendingCommand<C['commandKind']>,
  ): Promise<void>;
  protected abstract errorMessage(error: unknown): string;
  protected async send(scope: CommandScope) {
    const command = this.intent;
    if (!command) return;
    this.busy = true;
    const epoch = ++this.epoch,
      request = new AbortController();
    this.request = request;
    let started = false;
    const previouslySent = this.descriptor !== null;
    this.publish(this.transient('SENDING', 'Registrando…'));
    const descriptor: PendingCommand<C['commandKind']> = {
      operationId: command.operationId,
      inventoryId: scope.inventoryId,
      commandKind: command.commandKind,
    };
    try {
      await this.sendCommand(scope, command, request.signal, () => {
        const current = commandScope(this.session);
        if (
          !this.current(epoch, scope) ||
          !current ||
          current.inventoryId !== scope.inventoryId ||
          current.businessId !== scope.businessId ||
          request.signal.aborted
        )
          throw new Error('Session boundary');
        writeDescriptor(this.storage, this.pending.key, descriptor);
        this.descriptor = descriptor;
        started = true;
      });
      if (this.current(epoch, scope))
        await this.accepted(scope, epoch, false, descriptor);
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
      if ((!started && previouslySent) || (started && !definitive))
        this.publish(
          this.transient(
            'UNCERTAIN',
            'No sabemos aún si se registró. Comprueba el estado o reintenta el mismo envío.',
            true,
          ),
        );
      else await this.terminal(error, scope, epoch, started);
    } finally {
      if (epoch === this.epoch) this.busy = false;
    }
  }
  async retry() {
    const scope = commandScope(this.session);
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
  async check() {
    const scope = commandScope(this.session),
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
    this.publish(
      this.transient('CHECKING', 'Estamos comprobando si se registró.'),
    );
    try {
      const receipt = await this.readReceipt(
        scope,
        descriptor.operationId,
        request.signal,
      );
      if (!this.current(epoch, scope)) return;
      if (receipt?.status === 'ACCEPTED')
        await this.accepted(scope, epoch, true, descriptor, receipt);
      else if (receipt)
        await this.receiptTerminal(receipt, scope, epoch, descriptor);
      else
        this.publish(
          this.transient(
            'UNCERTAIN',
            'No pudimos confirmar el envío anterior.',
            this.intent !== null,
          ),
        );
    } catch (error) {
      if (!this.current(epoch, scope)) return;
      this.session.handleBusinessError(error);
      if (this.current(epoch, scope))
        this.publish(
          this.transient(
            'UNCERTAIN',
            `No pudimos confirmar el envío anterior. ${this.errorMessage(error)}`,
            this.intent !== null,
          ),
        );
    } finally {
      if (epoch === this.epoch) this.busy = false;
    }
  }
  discard() {
    if (!this.busy && this.view.kind === 'UNCERTAIN') this.reset();
  }
  acknowledge() {
    if (this.view.kind === 'ACCEPTED') this.publish(this.ready);
  }
  dispose() {
    this.unsubscribe();
    this.unsubscribeBoundary();
    this.request?.abort();
    this.epoch++;
  }
}
