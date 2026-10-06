import {
  AdjustStockUseCase,
  AdjustmentProductUnavailableError,
  MissingAdjustmentInventoryStateError,
  NoStockAdjustmentNeededError,
  AdjustmentCurrentCostRequiredError,
  InvalidAdjustmentCostModeError,
} from '@stock-app/application';
import type { AdjustStockCommand } from '@stock-app/contracts';
import type {
  CommandTransaction,
  CommandOutcome,
} from '../infrastructure/postgres/command-executor.js';
import { CommandError } from '../commands/errors.js';
import { moneyTransport } from '../sales/mappers.js';
import { transportMoney } from '../purchases/mappers.js';
import { createBoundAdjustmentTransaction } from './transaction.js';

export type AdjustmentCommand = AdjustStockCommand;
const rejected = (
  errorCode: 'NOT_FOUND' | 'DOMAIN_RULE' | 'MONEY_OVERFLOW',
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
      'stock_adjustments_pkey',
      'inventory_movements_pkey',
      'inventory_movements_inventory_id_id_unique',
      'inventory_movements_inventory_product_id_unique',
    ].includes(String(cause.constraint))
  );
}
export async function executeAdjustmentCommand(
  tx: CommandTransaction,
  inventoryId: string,
  command: AdjustmentCommand,
): Promise<CommandOutcome> {
  if (typeof command.preconditions.expectedStateRevision !== 'string')
    throw new CommandError(400, 'VALIDATION_ERROR');
  const capture = await createBoundAdjustmentTransaction(
      tx,
      inventoryId,
      command,
    ),
    productId = command.payload.productId.toLowerCase(),
    product = capture.domainProducts.find((p) => p.id === productId),
    state = capture.stateRecords.find((s) => s.productId === productId)?.state,
    old = capture.oldState;
  if (!product || product.isArchived) return rejected('NOT_FOUND');
  if (!state || !old) throw new MissingAdjustmentInventoryStateError(productId);
  const expected = command.preconditions.expectedState;
  if (
    old.stateRevision !== BigInt(command.preconditions.expectedStateRevision) ||
    state.stock !== expected.stock ||
    moneyTransport(state.unitCost) !== expected.unitCost ||
    old.lastMovementId?.toLowerCase() !== expected.lastMovementId?.toLowerCase()
  )
    return {
      status: 'CONFLICT',
      references: {
        errorCode: 'REVISION_CONFLICT',
        currentRevision: old.stateRevision.toString(),
      },
    };
  try {
    await new AdjustStockUseCase({
      transactionManager: capture.transactionManager,
    }).execute({
      inventoryId,
      ...command.payload,
      stockAdjustmentId: command.payload.stockAdjustmentId.toLowerCase(),
      movementId: command.payload.movementId.toLowerCase(),
      productId,
      customUnitCost: transportMoney(command.payload.customUnitCost),
      occurredAt: command.occurredAt,
    });
  } catch (error) {
    if (error instanceof MissingAdjustmentInventoryStateError) throw error;
    if (error instanceof AdjustmentProductUnavailableError)
      return rejected('NOT_FOUND');
    // Domain Money's narrow overflow guard is confined to pure Application, never persistence.
    if (
      error instanceof RangeError &&
      error.message === 'Scaled units must be a safe integer.'
    )
      return rejected('MONEY_OVERFLOW');
    if (
      error instanceof RangeError ||
      error instanceof TypeError ||
      error instanceof NoStockAdjustmentNeededError ||
      error instanceof AdjustmentCurrentCostRequiredError ||
      error instanceof InvalidAdjustmentCostModeError
    )
      return rejected('DOMAIN_RULE');
    throw error;
  }
  try {
    return {
      status: 'ACCEPTED',
      references: { stockAdjustmentId: command.payload.stockAdjustmentId },
      changes: await capture.persist(),
    };
  } catch (error) {
    if (identityCollision(error)) return rejected('DOMAIN_RULE');
    throw error;
  }
}
