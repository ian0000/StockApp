import {
  createSchemaValidator,
  createProductResultSchema,
  productMutationResultSchema,
  type CreateProductCommandResult,
  type ProductMutationResult,
  type OperationReceipt,
} from '@stock-app/contracts';
import type { ProductCommand } from './execute.js';

const validateCreate = createSchemaValidator(createProductResultSchema);
const validateMutation = createSchemaValidator(productMutationResultSchema);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function reconstructProductResult(
  receipt: OperationReceipt,
  command: ProductCommand,
): CreateProductCommandResult | ProductMutationResult {
  if (
    receipt.status !== 'ACCEPTED' ||
    !same(receipt.operationId, command.operationId)
  )
    throw new Error('Invalid product receipt.');
  const { changeSet: changes } = receipt;
  const {
    products,
    inventoryStates: states,
    inventoryMovements: movements,
    ...other
  } = changes.upserts;
  const product = products[0];
  if (
    products.length !== 1 ||
    !product ||
    !same(product.id, command.payload.productId) ||
    !same(product.inventoryId, changes.inventoryId) ||
    changes.tombstones.length ||
    Object.values(other).some((values) => values.length)
  )
    throw new Error('Incomplete product ChangeSet.');
  const metadata = {
    committedRevision: changes.revision,
    serverRecordedAt: changes.serverRecordedAt,
  };
  if (command.commandKind === 'PRODUCT_CREATE') {
    const p = command.payload,
      state = states[0],
      initialMovement = movements[0] ?? null;
    if (
      states.length !== 1 ||
      !state ||
      !same(state.productId, product.id) ||
      !same(state.inventoryId, changes.inventoryId) ||
      state.stateRevision !== '0' ||
      product.metadataRevision !== '0' ||
      product.isArchived ||
      product.createdAt !== p.createdAt ||
      product.updatedAt !== p.createdAt ||
      state.stock !== p.initialStock ||
      state.unitCost !== p.initialUnitCost
    )
      throw new Error('Invalid initial state.');
    if (p.initialMovementId === null) {
      if (
        movements.length ||
        state.lastMovementId !== null ||
        state.stock !== 0 ||
        state.unitCost !== null
      )
        throw new Error('Invalid zero-stock result.');
    } else if (
      movements.length !== 1 ||
      !initialMovement ||
      !same(initialMovement.id, p.initialMovementId) ||
      !state.lastMovementId ||
      !same(state.lastMovementId, initialMovement.id) ||
      !same(initialMovement.productId, product.id) ||
      !same(initialMovement.inventoryId, changes.inventoryId) ||
      initialMovement.type !== 'INITIAL_STOCK' ||
      initialMovement.quantityDelta !== p.initialStock ||
      initialMovement.stockBefore !== 0 ||
      initialMovement.stockAfter !== state.stock ||
      initialMovement.unitCostSnapshot !== state.unitCost ||
      initialMovement.sourceId !== null ||
      initialMovement.sourceType !== null ||
      initialMovement.reversalOfMovementId !== null ||
      initialMovement.metadata !== null ||
      initialMovement.effectiveAt !== command.occurredAt ||
      initialMovement.createdAt !== p.createdAt ||
      initialMovement.updatedAt !== p.createdAt
    )
      throw new Error('Invalid initial movement.');
    const result = { product, state, initialMovement, ...metadata };
    validateCreate(result);
    return result;
  }
  if (
    states.length ||
    movements.length ||
    product.isArchived !== (command.commandKind === 'PRODUCT_ARCHIVE') ||
    BigInt(product.metadataRevision) !==
      BigInt(command.preconditions.expectedMetadataRevision) + 1n
  )
    throw new Error('Invalid product mutation result.');
  const result = { product, ...metadata };
  validateMutation(result);
  return result;
}
