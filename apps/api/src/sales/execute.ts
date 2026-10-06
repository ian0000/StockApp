import {
  RegisterSaleUseCase,
  SaleProductUnavailableError,
  MissingInventoryStateError,
  EmptySaleError,
  DuplicateSaleProductError,
} from '@stock-app/application';
import { Money } from '@stock-app/domain';
import { decodeMoney, type CommandEnvelopeV1 } from '@stock-app/contracts';
import type {
  CommandTransaction,
  CommandOutcome,
} from '../infrastructure/postgres/command-executor.js';
import { createBoundSaleTransaction } from './transaction.js';
import { moneyTransport } from './mappers.js';
export type SaleCommand = Extract<
  CommandEnvelopeV1,
  { commandKind: 'SALE_REGISTER' }
>;
const rejected = (
  code: 'DOMAIN_RULE' | 'NOT_FOUND' | 'MONEY_OVERFLOW',
): CommandOutcome => ({ status: 'REJECTED', references: { errorCode: code } });
const conflict = (): CommandOutcome => ({
  status: 'CONFLICT',
  references: { errorCode: 'COST_SNAPSHOT_CONFLICT' },
});
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
      'sales_pkey',
      'sales_inventory_id_id_unique',
      'sale_items_pkey',
      'inventory_movements_pkey',
      'inventory_movements_inventory_id_id_unique',
      'inventory_movements_inventory_product_id_unique',
    ].includes(String(cause.constraint))
  );
}

export async function executeSaleCommand(
  tx: CommandTransaction,
  inventoryId: string,
  command: SaleCommand,
): Promise<CommandOutcome> {
  const capture = await createBoundSaleTransaction(tx, inventoryId, command);
  const products = new Map(capture.domainProducts.map((p) => [p.id, p]));
  const states = new Map(
    capture.stateRecords.map((s) => [s.productId, s.state]),
  );
  const expected = new Map(
    command.preconditions.expectedCosts.map((e) => [
      e.productId.toLowerCase(),
      e,
    ]),
  );
  for (const line of command.payload.items) {
    const id = line.productId.toLowerCase(),
      product = products.get(id);
    if (!product || product.isArchived) return rejected('NOT_FOUND');
    if (!states.has(id)) throw new MissingInventoryStateError(id);
  }
  for (const line of command.payload.items) {
    const state = states.get(line.productId.toLowerCase()),
      evidence = expected.get(line.productId.toLowerCase());
    if (!state || !evidence) throw new Error('Missing sale evidence/state.');
    if (moneyTransport(state.unitCost) !== evidence.unitCostSnapshot)
      return conflict();
  }
  let result;
  try {
    result = await new RegisterSaleUseCase({
      transactionManager: capture.transactionManager,
    }).execute({
      inventoryId,
      saleId: command.payload.saleId.toLowerCase(),
      occurredAt: command.occurredAt,
      createdAt: command.payload.createdAt,
      notes: command.payload.notes,
      items: command.payload.items.map((line) => ({
        ...line,
        productId: line.productId.toLowerCase(),
        saleItemId: line.saleItemId.toLowerCase(),
        movementId: line.movementId.toLowerCase(),
        unitSalePrice: Money.fromScaledUnits(decodeMoney(line.unitSalePrice)),
      })),
    });
  } catch (error) {
    if (error instanceof MissingInventoryStateError) throw error;
    if (error instanceof SaleProductUnavailableError)
      return rejected('NOT_FOUND');
    // Money has no typed overflow export. This narrow guard is limited to pure Application
    // execution after transport/DB validation; persistence errors are outside this catch.
    if (
      error instanceof RangeError &&
      error.message === 'Scaled units must be a safe integer.'
    )
      return rejected('MONEY_OVERFLOW');
    if (
      error instanceof RangeError ||
      error instanceof TypeError ||
      error instanceof EmptySaleError ||
      error instanceof DuplicateSaleProductError
    )
      return rejected('DOMAIN_RULE');
    throw error;
  }
  for (const item of result.items) {
    const evidence = expected.get(item.productId);
    if (
      !evidence ||
      moneyTransport(item.estimatedCost) !== evidence.estimatedCost ||
      moneyTransport(item.estimatedProfit) !== evidence.estimatedProfit
    )
      return conflict();
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
