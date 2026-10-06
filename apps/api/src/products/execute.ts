import {
  CreateProductUseCase,
  UpdateProductUseCase,
  ArchiveProductUseCase,
  ProductManagementUnavailableError,
} from '@stock-app/application';
import { Money } from '@stock-app/domain';
import { decodeMoney, type CommandEnvelopeV1 } from '@stock-app/contracts';
import type {
  CommandOutcome,
  CommandTransaction,
} from '../infrastructure/postgres/command-executor.js';
import {
  boundProductTransaction,
  productManagementRepository,
  findProduct,
  ProductRuleError,
} from './repositories.js';
import { productDto, stateDto, movementDto } from './mappers.js';
import { serverDate } from '../infrastructure/postgres/change-sets.js';

export type ProductCommand = Extract<
  CommandEnvelopeV1,
  { commandKind: 'PRODUCT_CREATE' | 'PRODUCT_UPDATE' | 'PRODUCT_ARCHIVE' }
>;
function rejected(
  code: 'DOMAIN_RULE' | 'NOT_FOUND' | 'MONEY_OVERFLOW',
): CommandOutcome {
  return { status: 'REJECTED', references: { errorCode: code } };
}

function expectedUniqueError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  let cause: unknown = error;
  for (
    let depth = 0;
    depth < 3 && cause instanceof Error && 'cause' in cause;
    depth++
  )
    cause = cause.cause;
  return (
    cause instanceof Error &&
    'code' in cause &&
    cause.code === '23505' &&
    'constraint' in cause &&
    [
      'products_pkey',
      'products_inventory_id_id_unique',
      'products_active_barcode_unique',
      'inventory_movements_pkey',
    ].includes(String(cause.constraint))
  );
}

export async function executeProductCommand(
  tx: CommandTransaction,
  inventoryId: string,
  command: ProductCommand,
  clock: () => number = Date.now,
): Promise<CommandOutcome> {
  const { payload } = command;
  const productId = payload.productId.toLowerCase();
  const existing = await findProduct(tx, inventoryId, productId);
  if (command.commandKind === 'PRODUCT_CREATE') {
    if (existing) return rejected('DOMAIN_RULE');
  } else {
    if (
      !existing ||
      (command.commandKind === 'PRODUCT_UPDATE' && existing.isArchived)
    )
      return rejected('NOT_FOUND');
    if (command.commandKind === 'PRODUCT_ARCHIVE' && existing.isArchived)
      return rejected('DOMAIN_RULE');
    if (
      BigInt(command.preconditions.expectedMetadataRevision) !==
      existing.metadataRevision
    )
      return {
        status: 'CONFLICT',
        references: {
          errorCode: 'REVISION_CONFLICT',
          currentRevision: existing.metadataRevision.toString(),
        },
      };
    if (existing.metadataRevision === 9223372036854775807n)
      throw new Error('Metadata revision overflow.');
  }
  const serverTime =
    command.commandKind === 'PRODUCT_CREATE' ? 0 : serverDate(clock).getTime();
  try {
    const upserts = {
      products: [],
      inventoryStates: [],
      inventoryMovements: [],
      sales: [],
      saleItems: [],
      purchases: [],
      stockAdjustments: [],
    };
    if (command.commandKind === 'PRODUCT_CREATE') {
      const p = command.payload;
      const result = await new CreateProductUseCase({
        transactionManager: boundProductTransaction(tx, inventoryId),
      }).execute({
        ...p,
        productId,
        initialMovementId: p.initialMovementId?.toLowerCase() ?? null,
        inventoryId,
        occurredAt: command.occurredAt,
        regularSalePrice: Money.fromScaledUnits(
          decodeMoney(p.regularSalePrice),
        ),
        initialUnitCost:
          p.initialUnitCost === null
            ? null
            : Money.fromScaledUnits(decodeMoney(p.initialUnitCost)),
      });
      return {
        status: 'ACCEPTED',
        references: { productId: p.productId },
        changes: {
          upserts: {
            ...upserts,
            products: [productDto(result.product, 0n)],
            inventoryStates: [
              stateDto(
                inventoryId,
                productId,
                result.inventory,
                result.initialMovement?.id ?? null,
              ),
            ],
            inventoryMovements:
              result.initialMovement === null
                ? []
                : [movementDto(result.initialMovement)],
          },
          tombstones: [],
        },
      };
    }
    if (!existing) throw new Error('Missing managed product.');
    const revision = existing.metadataRevision + 1n;
    const dependencies = {
      productRepository: productManagementRepository(tx, inventoryId, revision),
      clock: { now: () => serverTime },
    };
    const product =
      command.commandKind === 'PRODUCT_UPDATE'
        ? await new UpdateProductUseCase(dependencies).execute({
            ...command.payload,
            productId,
            inventoryId,
            regularSalePrice: Money.fromScaledUnits(
              decodeMoney(command.payload.regularSalePrice),
            ),
          })
        : await new ArchiveProductUseCase(dependencies).execute({
            inventoryId,
            productId,
          });
    return {
      status: 'ACCEPTED',
      references: { productId: payload.productId },
      changes: {
        upserts: { ...upserts, products: [productDto(product, revision)] },
        tombstones: [],
      },
    };
  } catch (error) {
    if (error instanceof ProductManagementUnavailableError)
      return rejected('NOT_FOUND');
    if (
      error instanceof ProductRuleError ||
      error instanceof TypeError ||
      error instanceof RangeError ||
      expectedUniqueError(error)
    )
      return rejected('DOMAIN_RULE');
    throw error;
  }
}
