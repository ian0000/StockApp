import {
  VoidSaleUseCase,
  SaleNotFoundError,
  ConfirmedSaleHasReversalError,
  SaleVoidInconsistentDataError,
} from '@stock-app/application';
import type { VoidSaleCommand } from '@stock-app/contracts';
import type {
  CommandTransaction,
  CommandOutcome,
} from '../infrastructure/postgres/command-executor.js';
import { CommandError } from '../commands/errors.js';
import { moneyTransport } from '../sales/mappers.js';
import { createBoundVoidSaleTransaction } from './transaction.js';

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
export async function executeVoidSaleCommand(
  tx: CommandTransaction,
  inventoryId: string,
  command: VoidSaleCommand,
  clock: () => number = Date.now,
): Promise<CommandOutcome> {
  if (
    command.preconditions.states.some(
      (s) => typeof s.expectedStateRevision !== 'string',
    )
  )
    throw new CommandError(400, 'VALIDATION_ERROR');
  const capture = await createBoundVoidSaleTransaction(
    tx,
    inventoryId,
    command,
  );
  if (!capture) return rejected('NOT_FOUND');
  const actualProducts = new Set(capture.items.map((i) => i.productId));
  if (!actualProducts.size || actualProducts.size !== capture.items.length)
    throw new Error('Incomplete persisted Sale products.');
  if (
    command.preconditions.states.length !== actualProducts.size ||
    command.payload.reversalMovements.length !== actualProducts.size ||
    new Set(command.preconditions.states.map((s) => s.productId.toLowerCase()))
      .size !== actualProducts.size ||
    command.preconditions.states.some(
      (s) => !actualProducts.has(s.productId.toLowerCase()),
    ) ||
    new Set(
      command.payload.reversalMovements.map((s) => s.productId.toLowerCase()),
    ).size !== actualProducts.size ||
    command.payload.reversalMovements.some(
      (s) => !actualProducts.has(s.productId.toLowerCase()),
    )
  )
    return rejected('DOMAIN_RULE');
  for (const evidence of command.preconditions.states) {
    const productId = evidence.productId.toLowerCase(),
      old = capture.stateRows.find((s) => s.productId === productId),
      state = capture.stateRecords.find(
        (s) => s.productId === productId,
      )?.state;
    if (!old || !state) throw new Error('Missing Sale void state.');
    if (typeof evidence.expectedStateRevision !== 'string')
      throw new CommandError(400, 'VALIDATION_ERROR');
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
  }
  // Cloud checks state before Application's local ALREADY_VOIDED shortcut. API-01 owns same-key replay.
  try {
    const result = await new VoidSaleUseCase({
      transactionManager: capture.transactionManager,
      clock: { now: clock },
    }).execute({
      inventoryId,
      saleId: command.payload.saleId.toLowerCase(),
      reversalMovements: command.payload.reversalMovements.map((m) => ({
        productId: m.productId.toLowerCase(),
        movementId: m.movementId.toLowerCase(),
      })),
      occurredAt: command.occurredAt,
      createdAt: command.payload.createdAt,
    });
    if (result.kind !== 'VOIDED') return rejected('VOID_NOT_ELIGIBLE');
  } catch (error) {
    if (error instanceof SaleNotFoundError) return rejected('NOT_FOUND');
    if (
      error instanceof ConfirmedSaleHasReversalError ||
      error instanceof SaleVoidInconsistentDataError
    )
      throw error;
    if (error instanceof TypeError || error instanceof RangeError)
      return rejected('DOMAIN_RULE');
    throw error;
  }
  try {
    return {
      status: 'ACCEPTED',
      references: { saleId: command.payload.saleId },
      changes: await capture.persist(),
    };
  } catch (error) {
    if (identityCollision(error)) return rejected('DOMAIN_RULE');
    throw error;
  }
}
