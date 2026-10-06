import type { TestContext } from 'node:test';
import type { CommandEnvelopeV1 } from '@stock-app/contracts';
import { id } from '../postgres/helpers.js';
import { engineFixture } from '../commands/helpers.js';
import {
  executeProductCommand,
  type ProductCommand,
} from '../../src/products/execute.js';
import { reconstructProductResult } from '../../src/products/results.js';
import type { CloudInventoryContext } from '../../src/infrastructure/postgres/command-executor.js';

export type CreateCommand = Extract<
  CommandEnvelopeV1,
  { commandKind: 'PRODUCT_CREATE' }
>;
export function createCommand(
  payload: Partial<CreateCommand['payload']> = {},
): CreateCommand {
  return {
    operationId: id(),
    commandKind: 'PRODUCT_CREATE',
    protocolVersion: 1,
    domainVersion: 1,
    occurredAt: 123,
    dependsOn: [],
    deviceId: null,
    preconditions: {},
    payload: {
      productId: id(),
      initialMovementId: null,
      createdAt: 456,
      name: 'Fictional Product',
      variant: null,
      barcode: null,
      regularSalePrice: '10666667',
      minimumStock: null,
      initialStock: 0,
      initialUnitCost: null,
      ...payload,
    },
  };
}
export function updateCommand(
  productId: string,
  revision = '0',
  fields: Partial<
    Extract<ProductCommand, { commandKind: 'PRODUCT_UPDATE' }>['payload']
  > = {},
): Extract<ProductCommand, { commandKind: 'PRODUCT_UPDATE' }> {
  return {
    ...createCommand(),
    commandKind: 'PRODUCT_UPDATE',
    preconditions: { expectedMetadataRevision: revision },
    payload: {
      productId,
      name: 'Updated Product',
      variant: 'Updated',
      barcode: null,
      regularSalePrice: '9007199254740991',
      minimumStock: 3,
      ...fields,
    },
  };
}
export function archiveCommand(
  productId: string,
  revision = '0',
): Extract<ProductCommand, { commandKind: 'PRODUCT_ARCHIVE' }> {
  return {
    ...createCommand(),
    commandKind: 'PRODUCT_ARCHIVE',
    preconditions: { expectedMetadataRevision: revision },
    payload: { productId },
  };
}
export async function productsFixture(t: TestContext) {
  const f = await engineFixture(t);
  const context = await f.dataset();
  async function run(
    command: ProductCommand,
    scope: CloudInventoryContext = context,
  ) {
    return f.execute(
      f.input(scope, command, (tx, inventory) =>
        executeProductCommand(tx, inventory.id, command, () => 2000),
      ),
    );
  }
  async function result(
    command: ProductCommand,
    scope: CloudInventoryContext = context,
  ) {
    return reconstructProductResult(await run(command, scope), command);
  }
  return { ...f, context, run, result };
}
