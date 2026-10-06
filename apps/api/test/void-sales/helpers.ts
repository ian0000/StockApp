import type { TestContext } from 'node:test';
import type { VoidSaleCommand, OperationReceipt } from '@stock-app/contracts';
import { executeVoidSaleCommand } from '../../src/void-sales/execute.js';
import { reconstructVoidSaleResult } from '../../src/void-sales/results.js';
import { loadOriginalSaleMovements } from '../../src/void-sales/mappers.js';
import { salesFixture, saleCommand } from '../sales/helpers.js';
import { id } from '../postgres/helpers.js';

export function voidCommand(
  saleId: string,
  states: VoidSaleCommand['preconditions']['states'],
): VoidSaleCommand {
  return {
    operationId: id(),
    commandKind: 'SALE_VOID',
    protocolVersion: 1,
    domainVersion: 1,
    occurredAt: 1500,
    dependsOn: [],
    deviceId: null,
    payload: {
      saleId,
      createdAt: 1600,
      reversalMovements: states.map((state) => ({
        productId: state.productId,
        movementId: id(),
      })),
    },
    preconditions: { states },
  };
}
export async function voidSalesFixture(t: TestContext) {
  const f = await salesFixture(t);
  async function sale(
    count = 1,
    stock = 10,
    cost: string | null = '5000000',
    scope = f.context,
  ) {
    const productIds: string[] = [];
    for (let i = 0; i < count; i++)
      productIds.push(await f.product(stock, cost, scope));
    const command = saleCommand(
      productIds.map((productId) => ({
        productId,
        quantity: 2,
        price: '15000000',
        cost,
        estimatedCost: cost === null ? null : String(BigInt(cost) * 2n),
        estimatedProfit:
          cost === null ? null : String(30000000n - BigInt(cost) * 2n),
      })),
    );
    command.occurredAt = 900;
    command.payload.createdAt = 1000;
    await f.run(command, scope);
    return command;
  }
  async function command(saleId: string, scope = f.context) {
    const rows = (
      await f.pool.query(
        'SELECT s.* FROM inventory_states s JOIN sale_items l ON l.inventory_id=s.inventory_id AND l.product_id=s.product_id WHERE l.inventory_id=$1 AND l.sale_id=$2 ORDER BY s.product_id',
        [scope.inventory.id, saleId],
      )
    ).rows;
    return voidCommand(
      saleId,
      rows.map((row) => ({
        productId: row.product_id,
        expectedStateRevision: row.state_revision,
        expectedState: {
          stock: Number(row.stock),
          unitCost: row.unit_cost_units,
          lastMovementId: row.last_movement_id,
        },
      })),
    );
  }
  async function run(command: VoidSaleCommand, scope = f.context) {
    return f.execute(
      f.input(scope, command, (tx, inventory) =>
        executeVoidSaleCommand(tx, inventory.id, command, () => 2000),
      ),
    );
  }
  async function result(
    receipt: OperationReceipt,
    command: VoidSaleCommand,
    scope = f.context,
  ) {
    return reconstructVoidSaleResult(
      receipt,
      command,
      await loadOriginalSaleMovements(
        f.db,
        scope.inventory.id,
        command.payload.saleId,
      ),
    );
  }
  return { ...f, sale, command, run, result, runSale: f.run };
}
