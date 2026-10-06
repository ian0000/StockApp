import {
  RegisterPurchaseUseCase,
  PurchaseProductUnavailableError,
  MissingPurchaseInventoryStateError,
} from '@stock-app/application';
import { Money } from '@stock-app/domain';
import {
  decodeMoney,
  type RegisterPurchaseCommand,
} from '@stock-app/contracts';
import type {
  CommandTransaction,
  CommandOutcome,
} from '../infrastructure/postgres/command-executor.js';
import { CommandError } from '../commands/errors.js';
import { createBoundPurchaseTransaction } from './transaction.js';
import { moneyTransport } from '../sales/mappers.js';
export type PurchaseCommand = RegisterPurchaseCommand;
const rejected = (
  errorCode: 'DOMAIN_RULE' | 'NOT_FOUND' | 'MONEY_OVERFLOW',
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
      'purchases_pkey',
      'inventory_movements_pkey',
      'inventory_movements_inventory_id_id_unique',
      'inventory_movements_inventory_product_id_unique',
    ].includes(String(cause.constraint))
  );
}
export async function executePurchaseCommand(
  tx: CommandTransaction,
  inventoryId: string,
  command: PurchaseCommand,
): Promise<CommandOutcome> {
  if (typeof command.preconditions.expectedStateRevision !== 'string')
    throw new CommandError(400, 'VALIDATION_ERROR');
  const capture = await createBoundPurchaseTransaction(
      tx,
      inventoryId,
      command,
    ),
    productId = command.payload.productId.toLowerCase(),
    product = capture.domainProducts.find((p) => p.id === productId),
    state = capture.stateRecords.find((s) => s.productId === productId)?.state,
    old = capture.oldState;
  if (!product || product.isArchived) return rejected('NOT_FOUND');
  if (!state || !old) throw new MissingPurchaseInventoryStateError(productId);
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
    await new RegisterPurchaseUseCase({
      transactionManager: capture.transactionManager,
    }).execute({
      inventoryId,
      ...command.payload,
      purchaseId: command.payload.purchaseId.toLowerCase(),
      movementId: command.payload.movementId.toLowerCase(),
      productId,
      unitCost: Money.fromScaledUnits(decodeMoney(command.payload.unitCost)),
      occurredAt: command.occurredAt,
    });
  } catch (error) {
    if (error instanceof MissingPurchaseInventoryStateError) throw error;
    if (error instanceof PurchaseProductUnavailableError)
      return rejected('NOT_FOUND');
    // Same narrow Money guard as API-03, confined to pure Application; SQL is outside this catch.
    if (
      error instanceof RangeError &&
      error.message === 'Scaled units must be a safe integer.'
    )
      return rejected('MONEY_OVERFLOW');
    if (error instanceof RangeError || error instanceof TypeError)
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
