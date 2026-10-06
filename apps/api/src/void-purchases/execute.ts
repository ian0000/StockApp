import {
  VoidPurchaseUseCase,
  PurchaseNotFoundError,
  ConfirmedPurchaseHasReversalError,
  PurchaseVoidInconsistentDataError,
} from '@stock-app/application';
import type { VoidPurchaseCommand } from '@stock-app/contracts';
import type {
  CommandTransaction,
  CommandOutcome,
} from '../infrastructure/postgres/command-executor.js';
import { CommandError } from '../commands/errors.js';
import { moneyTransport } from '../sales/mappers.js';
import { createBoundVoidPurchaseTransaction } from './transaction.js';

const rejected = (
  errorCode: 'NOT_FOUND' | 'DOMAIN_RULE' | 'VOID_NOT_ELIGIBLE',
): CommandOutcome => ({ status: 'REJECTED', references: { errorCode } });
function identityCollision(error: unknown): boolean {
  let cause = error;
  for (let i = 0; i < 3 && cause instanceof Error && 'cause' in cause; i++)
    cause = cause.cause;
  return (
    cause instanceof Error &&
    'code' in cause &&
    cause.code === '23505' &&
    'constraint' in cause &&
    [
      'inventory_movements_pkey',
      'inventory_movements_inventory_id_id_unique',
      'inventory_movements_inventory_product_id_unique',
    ].includes(String(cause.constraint))
  );
}
export async function executeVoidPurchaseCommand(
  tx: CommandTransaction,
  inventoryId: string,
  command: VoidPurchaseCommand,
  clock: () => number = Date.now,
): Promise<CommandOutcome> {
  const evidence = command.preconditions;
  if (typeof evidence.expectedStateRevision !== 'string')
    throw new CommandError(400, 'VALIDATION_ERROR');
  const capture = await createBoundVoidPurchaseTransaction(
    tx,
    inventoryId,
    command,
  );
  if (!capture) return rejected('NOT_FOUND');
  const old = capture.stateRows.find(
      (s) => s.productId === capture.purchase.productId,
    ),
    state = capture.stateRecords.find(
      (s) => s.productId === capture.purchase.productId,
    )?.state;
  if (!old || !state) throw new Error('Missing Purchase void state.');
  if (
    old.stateRevision !== BigInt(evidence.expectedStateRevision) ||
    state.stock !== evidence.expectedState.stock ||
    moneyTransport(state.unitCost) !== evidence.expectedState.unitCost ||
    old.lastMovementId?.toLowerCase() !==
      evidence.expectedState.lastMovementId?.toLowerCase()
  )
    return {
      status: 'CONFLICT',
      references: {
        errorCode: 'REVISION_CONFLICT',
        currentRevision: old.stateRevision.toString(),
      },
    };
  // Cloud checks exact state before the local ALREADY_VOIDED shortcut; API-01 owns same-key replay.
  try {
    const result = await new VoidPurchaseUseCase({
      transactionManager: capture.transactionManager,
      clock: { now: clock },
    }).execute({
      inventoryId,
      purchaseId: command.payload.purchaseId.toLowerCase(),
      reversalMovementId: command.payload.reversalMovementId.toLowerCase(),
      occurredAt: command.occurredAt,
      createdAt: command.payload.createdAt,
    });
    if (result.kind !== 'VOIDED') return rejected('VOID_NOT_ELIGIBLE');
  } catch (error) {
    if (error instanceof PurchaseNotFoundError) return rejected('NOT_FOUND');
    if (
      error instanceof ConfirmedPurchaseHasReversalError ||
      error instanceof PurchaseVoidInconsistentDataError
    )
      throw error;
    if (error instanceof TypeError || error instanceof RangeError)
      return rejected('DOMAIN_RULE');
    throw error;
  }
  try {
    return {
      status: 'ACCEPTED',
      references: { purchaseId: command.payload.purchaseId },
      changes: await capture.persist(),
    };
  } catch (error) {
    if (identityCollision(error)) return rejected('DOMAIN_RULE');
    throw error;
  }
}
