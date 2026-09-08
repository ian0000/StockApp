import {
  createInventory,
  createInventoryState,
  createProduct,
  createPurchase,
  createSale,
  createSaleItem,
  createStockAdjustment,
  Money,
} from '@stock-app/domain';

import {
  STOCKAPP_BACKUP_FORMAT,
  STOCKAPP_BACKUP_FORMAT_VERSION,
  type BackupDataV1,
  type BackupInventoryMovementV1,
  type BackupInventoryStateV1,
  type BackupInventoryV1,
  type BackupProductV1,
  type BackupPurchaseV1,
  type BackupSaleItemV1,
  type BackupSaleV1,
  type BackupStockAdjustmentV1,
  type StockAppBackupV1,
} from './create-backup';

export type BackupValidationErrorCode =
  'INVALID_JSON' | 'WRONG_FORMAT' | 'UNSUPPORTED_VERSION' | 'INVALID_DOCUMENT';

export class BackupValidationError extends Error {
  constructor(
    readonly code: BackupValidationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'BackupValidationError';
  }
}

declare const parsedBackupV1Brand: unique symbol;

export type ParsedBackupV1 = StockAppBackupV1 & {
  readonly [parsedBackupV1Brand]: true;
};

export interface BackupRestorePreview {
  readonly createdAt: number;
  readonly inventoryId: string;
  readonly inventoryName: string;
  readonly products: number;
  readonly archivedProducts: number;
  readonly sales: number;
  readonly voidedSales: number;
  readonly purchases: number;
  readonly voidedPurchases: number;
  readonly stockAdjustments: number;
}

export interface BackupRestoreTransaction {
  replace(data: BackupDataV1): Promise<void>;
}

export interface RestoreBackupInput {
  readonly backup: ParsedBackupV1;
}

export interface RestoreBackupResult {
  readonly inventoryId: string;
}

export class RestoreBackupUseCase {
  constructor(private readonly transaction: BackupRestoreTransaction) {}

  async execute({ backup }: RestoreBackupInput): Promise<RestoreBackupResult> {
    await this.transaction.replace(backup.data);

    return Object.freeze({ inventoryId: backup.inventoryId });
  }
}

export function parseBackupV1(contents: string): ParsedBackupV1 {
  if (typeof contents !== 'string') {
    throw new BackupValidationError(
      'INVALID_JSON',
      'Backup contents must be text.',
    );
  }

  let unknownDocument: unknown;
  try {
    unknownDocument = JSON.parse(contents);
  } catch (error) {
    throw new BackupValidationError(
      'INVALID_JSON',
      'Backup file does not contain valid JSON.',
      { cause: error },
    );
  }

  const envelope = requireRecord(unknownDocument, 'Backup');
  if (envelope.format !== STOCKAPP_BACKUP_FORMAT) {
    throw new BackupValidationError(
      'WRONG_FORMAT',
      'The file is not a StockApp backup.',
    );
  }
  if (envelope.formatVersion !== STOCKAPP_BACKUP_FORMAT_VERSION) {
    throw new BackupValidationError(
      'UNSUPPORTED_VERSION',
      'The backup version is not supported.',
    );
  }

  try {
    const createdAt = requireTimestamp(envelope.createdAt, 'Backup.createdAt');
    const inventoryId = requireId(envelope.inventoryId, 'Backup.inventoryId');
    const data = parseData(envelope.data);
    validateRelationships(data, inventoryId);

    return Object.freeze({
      format: STOCKAPP_BACKUP_FORMAT,
      formatVersion: STOCKAPP_BACKUP_FORMAT_VERSION,
      createdAt,
      inventoryId,
      data,
    }) as ParsedBackupV1;
  } catch (error) {
    if (error instanceof BackupValidationError) throw error;
    throw new BackupValidationError(
      'INVALID_DOCUMENT',
      'Backup data is invalid.',
      { cause: error },
    );
  }
}

export function createBackupRestorePreview(
  backup: ParsedBackupV1,
): BackupRestorePreview {
  return Object.freeze({
    createdAt: backup.createdAt,
    inventoryId: backup.inventoryId,
    inventoryName: backup.data.inventories[0]!.name,
    products: backup.data.products.length,
    archivedProducts: backup.data.products.filter(({ isArchived }) =>
      Boolean(isArchived),
    ).length,
    sales: backup.data.sales.length,
    voidedSales: backup.data.sales.filter(({ status }) => status === 'VOIDED')
      .length,
    purchases: backup.data.purchases.length,
    voidedPurchases: backup.data.purchases.filter(
      ({ status }) => status === 'VOIDED',
    ).length,
    stockAdjustments: backup.data.stockAdjustments.length,
  });
}

function parseData(value: unknown): BackupDataV1 {
  const data = requireRecord(value, 'Backup.data');

  return Object.freeze({
    inventories: parseCollection(
      data.inventories,
      'inventories',
      parseInventory,
    ),
    products: parseCollection(data.products, 'products', parseProduct),
    inventoryStates: parseCollection(
      data.inventoryStates,
      'inventoryStates',
      parseInventoryState,
    ),
    inventoryMovements: parseCollection(
      data.inventoryMovements,
      'inventoryMovements',
      parseInventoryMovement,
    ),
    sales: parseCollection(data.sales, 'sales', parseSale),
    saleItems: parseCollection(data.saleItems, 'saleItems', parseSaleItem),
    purchases: parseCollection(data.purchases, 'purchases', parsePurchase),
    stockAdjustments: parseCollection(
      data.stockAdjustments,
      'stockAdjustments',
      parseStockAdjustment,
    ),
  });
}

function parseCollection<T>(
  value: unknown,
  name: string,
  parse: (value: unknown, path: string) => T,
): readonly T[] {
  if (!Array.isArray(value)) invalid(`Backup.data.${name} must be an array.`);
  return Object.freeze(
    value.map((entry, index) => parse(entry, `${name}[${index}]`)),
  );
}

function parseInventory(value: unknown, path: string): BackupInventoryV1 {
  const row = requireRecord(value, path);
  const parsed = Object.freeze({
    id: requireId(row.id, `${path}.id`),
    name: requireNormalizedText(row.name, `${path}.name`),
    currency: requireString(row.currency, `${path}.currency`),
    createdAt: requireTimestamp(row.createdAt, `${path}.createdAt`),
    updatedAt: requireTimestamp(row.updatedAt, `${path}.updatedAt`),
  });

  validateDomain(() => createInventory(parsed), path);
  return parsed;
}

function parseProduct(value: unknown, path: string): BackupProductV1 {
  const row = requireRecord(value, path);
  const parsed = Object.freeze({
    id: requireId(row.id, `${path}.id`),
    inventoryId: requireId(row.inventoryId, `${path}.inventoryId`),
    name: requireNormalizedText(row.name, `${path}.name`),
    variant: requireNormalizedNullableText(row.variant, `${path}.variant`),
    barcode: requireNormalizedNullableText(row.barcode, `${path}.barcode`),
    regularSalePriceUnits: requireNonNegativeMoneyUnits(
      row.regularSalePriceUnits,
      `${path}.regularSalePriceUnits`,
    ),
    minimumStock: requireNullableNonNegativeSafeInteger(
      row.minimumStock,
      `${path}.minimumStock`,
    ),
    isArchived: requireBoolean(row.isArchived, `${path}.isArchived`),
    createdAt: requireTimestamp(row.createdAt, `${path}.createdAt`),
    updatedAt: requireTimestamp(row.updatedAt, `${path}.updatedAt`),
  });

  validateDomain(
    () =>
      createProduct({
        id: parsed.id,
        inventoryId: parsed.inventoryId,
        name: parsed.name,
        variant: parsed.variant,
        barcode: parsed.barcode,
        regularSalePrice: Money.fromScaledUnits(parsed.regularSalePriceUnits),
        minimumStock: parsed.minimumStock,
        createdAt: parsed.createdAt,
        updatedAt: parsed.updatedAt,
      }),
    path,
  );
  return parsed;
}

function parseInventoryState(
  value: unknown,
  path: string,
): BackupInventoryStateV1 {
  const row = requireRecord(value, path);
  const parsed = Object.freeze({
    inventoryId: requireId(row.inventoryId, `${path}.inventoryId`),
    productId: requireId(row.productId, `${path}.productId`),
    stock: requireSafeInteger(row.stock, `${path}.stock`),
    unitCostUnits: requireNullableNonNegativeMoneyUnits(
      row.unitCostUnits,
      `${path}.unitCostUnits`,
    ),
  });

  validateDomain(
    () =>
      createInventoryState({
        stock: parsed.stock,
        unitCost: moneyOrNull(parsed.unitCostUnits),
      }),
    path,
  );
  return parsed;
}

const MOVEMENT_TYPES = new Set([
  'INITIAL_STOCK',
  'PURCHASE',
  'SALE',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'REVERSAL',
]);

function parseInventoryMovement(
  value: unknown,
  path: string,
): BackupInventoryMovementV1 {
  const row = requireRecord(value, path);
  const type = requireEnum(row.type, MOVEMENT_TYPES, `${path}.type`);
  const quantityDelta = requireSafeInteger(
    row.quantityDelta,
    `${path}.quantityDelta`,
  );
  const stockBefore = requireSafeInteger(
    row.stockBefore,
    `${path}.stockBefore`,
  );
  const stockAfter = requireSafeInteger(row.stockAfter, `${path}.stockAfter`);
  const calculatedStockAfter = stockBefore + quantityDelta;

  if (quantityDelta === 0) invalid(`${path}.quantityDelta must be non-zero.`);
  if (
    !Number.isSafeInteger(calculatedStockAfter) ||
    stockAfter !== calculatedStockAfter
  ) {
    invalid(`${path} has an invalid stock transition.`);
  }

  const sourceType = requireNullableNormalizedText(
    row.sourceType,
    `${path}.sourceType`,
  );
  const sourceId = requireNullableId(row.sourceId, `${path}.sourceId`);
  if ((sourceType === null) !== (sourceId === null)) {
    invalid(`${path} sourceType and sourceId must be provided together.`);
  }

  return Object.freeze({
    id: requireId(row.id, `${path}.id`),
    inventoryId: requireId(row.inventoryId, `${path}.inventoryId`),
    productId: requireId(row.productId, `${path}.productId`),
    type: type as BackupInventoryMovementV1['type'],
    quantityDelta,
    unitCostSnapshotUnits: requireNullableNonNegativeMoneyUnits(
      row.unitCostSnapshotUnits,
      `${path}.unitCostSnapshotUnits`,
    ),
    stockBefore,
    stockAfter,
    sourceType,
    sourceId,
    metadata: requireNullableString(row.metadata, `${path}.metadata`),
    effectiveAt: requireTimestamp(row.effectiveAt, `${path}.effectiveAt`),
    createdAt: requireTimestamp(row.createdAt, `${path}.createdAt`),
    updatedAt: requireTimestamp(row.updatedAt, `${path}.updatedAt`),
  });
}

const OPERATION_STATUSES = new Set(['CONFIRMED', 'VOIDED']);
const COST_STATUSES = new Set(['KNOWN', 'UNKNOWN']);
const ADJUSTMENT_REASONS = new Set([
  'COUNT_CORRECTION',
  'DAMAGED',
  'LOST',
  'INTERNAL_USE',
  'OTHER',
]);
const ADJUSTMENT_COST_MODES = new Set(['USE_CURRENT_COST', 'CUSTOM_COST']);

function parseSale(value: unknown, path: string): BackupSaleV1 {
  const row = requireRecord(value, path);
  const parsed = Object.freeze({
    id: requireId(row.id, `${path}.id`),
    inventoryId: requireId(row.inventoryId, `${path}.inventoryId`),
    effectiveAt: requireTimestamp(row.effectiveAt, `${path}.effectiveAt`),
    createdAt: requireTimestamp(row.createdAt, `${path}.createdAt`),
    updatedAt: requireTimestamp(row.updatedAt, `${path}.updatedAt`),
    status: requireEnum(
      row.status,
      OPERATION_STATUSES,
      `${path}.status`,
    ) as BackupSaleV1['status'],
    totalAmountUnits: requirePositiveMoneyUnits(
      row.totalAmountUnits,
      `${path}.totalAmountUnits`,
    ),
    estimatedCostUnits: requireNullableNonNegativeMoneyUnits(
      row.estimatedCostUnits,
      `${path}.estimatedCostUnits`,
    ),
    estimatedProfitUnits: requireNullableMoneyUnits(
      row.estimatedProfitUnits,
      `${path}.estimatedProfitUnits`,
    ),
    notes: requireNormalizedNullableText(row.notes, `${path}.notes`),
  });

  validateDomain(
    () =>
      createSale({
        id: parsed.id,
        inventoryId: parsed.inventoryId,
        effectiveAt: parsed.effectiveAt,
        createdAt: parsed.createdAt,
        updatedAt: parsed.updatedAt,
        status: parsed.status,
        totalAmount: Money.fromScaledUnits(parsed.totalAmountUnits),
        estimatedCost: moneyOrNull(parsed.estimatedCostUnits),
        estimatedProfit: moneyOrNull(parsed.estimatedProfitUnits),
        notes: parsed.notes,
      }),
    path,
  );
  return parsed;
}

function parseSaleItem(value: unknown, path: string): BackupSaleItemV1 {
  const row = requireRecord(value, path);
  const parsed = Object.freeze({
    id: requireId(row.id, `${path}.id`),
    saleId: requireId(row.saleId, `${path}.saleId`),
    productId: requireId(row.productId, `${path}.productId`),
    quantity: requirePositiveSafeInteger(row.quantity, `${path}.quantity`),
    unitSalePriceUnits: requirePositiveMoneyUnits(
      row.unitSalePriceUnits,
      `${path}.unitSalePriceUnits`,
    ),
    subtotalUnits: requirePositiveMoneyUnits(
      row.subtotalUnits,
      `${path}.subtotalUnits`,
    ),
    unitCostSnapshotUnits: requireNullableNonNegativeMoneyUnits(
      row.unitCostSnapshotUnits,
      `${path}.unitCostSnapshotUnits`,
    ),
    estimatedCostUnits: requireNullableNonNegativeMoneyUnits(
      row.estimatedCostUnits,
      `${path}.estimatedCostUnits`,
    ),
    estimatedProfitUnits: requireNullableMoneyUnits(
      row.estimatedProfitUnits,
      `${path}.estimatedProfitUnits`,
    ),
    costStatus: requireEnum(
      row.costStatus,
      COST_STATUSES,
      `${path}.costStatus`,
    ) as BackupSaleItemV1['costStatus'],
    createdAt: requireTimestamp(row.createdAt, `${path}.createdAt`),
    updatedAt: requireTimestamp(row.updatedAt, `${path}.updatedAt`),
  });

  validateDomain(
    () =>
      createSaleItem({
        id: parsed.id,
        saleId: parsed.saleId,
        productId: parsed.productId,
        quantity: parsed.quantity,
        unitSalePrice: Money.fromScaledUnits(parsed.unitSalePriceUnits),
        subtotal: Money.fromScaledUnits(parsed.subtotalUnits),
        unitCostSnapshot: moneyOrNull(parsed.unitCostSnapshotUnits),
        estimatedCost: moneyOrNull(parsed.estimatedCostUnits),
        estimatedProfit: moneyOrNull(parsed.estimatedProfitUnits),
        costStatus: parsed.costStatus,
        createdAt: parsed.createdAt,
        updatedAt: parsed.updatedAt,
      }),
    path,
  );
  return parsed;
}

function parsePurchase(value: unknown, path: string): BackupPurchaseV1 {
  const row = requireRecord(value, path);
  const parsed = Object.freeze({
    id: requireId(row.id, `${path}.id`),
    inventoryId: requireId(row.inventoryId, `${path}.inventoryId`),
    productId: requireId(row.productId, `${path}.productId`),
    quantity: requirePositiveSafeInteger(row.quantity, `${path}.quantity`),
    unitCostUnits: requireNonNegativeMoneyUnits(
      row.unitCostUnits,
      `${path}.unitCostUnits`,
    ),
    totalAmountUnits: requireNonNegativeMoneyUnits(
      row.totalAmountUnits,
      `${path}.totalAmountUnits`,
    ),
    effectiveAt: requireTimestamp(row.effectiveAt, `${path}.effectiveAt`),
    createdAt: requireTimestamp(row.createdAt, `${path}.createdAt`),
    updatedAt: requireTimestamp(row.updatedAt, `${path}.updatedAt`),
    status: requireEnum(
      row.status,
      OPERATION_STATUSES,
      `${path}.status`,
    ) as BackupPurchaseV1['status'],
    notes: requireNormalizedNullableText(row.notes, `${path}.notes`),
    averageCostBeforeUnits: requireNullableNonNegativeMoneyUnits(
      row.averageCostBeforeUnits,
      `${path}.averageCostBeforeUnits`,
    ),
    averageCostAfterUnits: requireNonNegativeMoneyUnits(
      row.averageCostAfterUnits,
      `${path}.averageCostAfterUnits`,
    ),
    stockBefore: requireSafeInteger(row.stockBefore, `${path}.stockBefore`),
    stockAfter: requireSafeInteger(row.stockAfter, `${path}.stockAfter`),
  });

  validateDomain(
    () =>
      createPurchase({
        id: parsed.id,
        inventoryId: parsed.inventoryId,
        productId: parsed.productId,
        quantity: parsed.quantity,
        unitCost: Money.fromScaledUnits(parsed.unitCostUnits),
        totalAmount: Money.fromScaledUnits(parsed.totalAmountUnits),
        effectiveAt: parsed.effectiveAt,
        createdAt: parsed.createdAt,
        updatedAt: parsed.updatedAt,
        status: parsed.status,
        notes: parsed.notes,
        averageCostBefore: moneyOrNull(parsed.averageCostBeforeUnits),
        averageCostAfter: Money.fromScaledUnits(parsed.averageCostAfterUnits),
        stockBefore: parsed.stockBefore,
        stockAfter: parsed.stockAfter,
      }),
    path,
  );
  return parsed;
}

function parseStockAdjustment(
  value: unknown,
  path: string,
): BackupStockAdjustmentV1 {
  const row = requireRecord(value, path);
  const costMode =
    row.costMode === null
      ? null
      : (requireEnum(
          row.costMode,
          ADJUSTMENT_COST_MODES,
          `${path}.costMode`,
        ) as BackupStockAdjustmentV1['costMode']);
  const parsed = Object.freeze({
    id: requireId(row.id, `${path}.id`),
    inventoryId: requireId(row.inventoryId, `${path}.inventoryId`),
    productId: requireId(row.productId, `${path}.productId`),
    stockBefore: requireSafeInteger(row.stockBefore, `${path}.stockBefore`),
    actualStock: requireSafeInteger(row.actualStock, `${path}.actualStock`),
    difference: requireSafeInteger(row.difference, `${path}.difference`),
    reason: requireEnum(
      row.reason,
      ADJUSTMENT_REASONS,
      `${path}.reason`,
    ) as BackupStockAdjustmentV1['reason'],
    costMode,
    unitCostUnits: requireNonNegativeMoneyUnits(
      row.unitCostUnits,
      `${path}.unitCostUnits`,
    ),
    effectiveAt: requireTimestamp(row.effectiveAt, `${path}.effectiveAt`),
    createdAt: requireTimestamp(row.createdAt, `${path}.createdAt`),
    updatedAt: requireTimestamp(row.updatedAt, `${path}.updatedAt`),
  });

  validateDomain(
    () =>
      createStockAdjustment({
        id: parsed.id,
        inventoryId: parsed.inventoryId,
        productId: parsed.productId,
        stockBefore: parsed.stockBefore,
        actualStock: parsed.actualStock,
        difference: parsed.difference,
        reason: parsed.reason,
        costMode: parsed.costMode,
        unitCost: Money.fromScaledUnits(parsed.unitCostUnits),
        effectiveAt: parsed.effectiveAt,
        createdAt: parsed.createdAt,
        updatedAt: parsed.updatedAt,
      }),
    path,
  );
  return parsed;
}

function validateRelationships(data: BackupDataV1, inventoryId: string): void {
  if (
    data.inventories.length !== 1 ||
    data.inventories[0]?.id !== inventoryId
  ) {
    invalid('Backup V1 must contain exactly its declared Inventory.');
  }

  assertUniqueIds(data.inventories, 'Inventory');
  assertUniqueIds(data.products, 'Product');
  assertUniqueIds(data.inventoryMovements, 'InventoryMovement');
  assertUniqueIds(data.sales, 'Sale');
  assertUniqueIds(data.saleItems, 'SaleItem');
  assertUniqueIds(data.purchases, 'Purchase');
  assertUniqueIds(data.stockAdjustments, 'StockAdjustment');

  const products = indexById(data.products);
  const sales = indexById(data.sales);
  const purchases = indexById(data.purchases);
  const adjustments = indexById(data.stockAdjustments);
  const movements = indexById(data.inventoryMovements);

  for (const product of data.products) {
    requireSameInventory(product.inventoryId, inventoryId, 'Product');
  }
  validateActiveBarcodes(data.products);
  validateInventoryStates(data.inventoryStates, products, inventoryId);

  for (const sale of data.sales) {
    requireSameInventory(sale.inventoryId, inventoryId, 'Sale');
  }
  for (const purchase of data.purchases) {
    requireSameInventory(purchase.inventoryId, inventoryId, 'Purchase');
    requireReference(products, purchase.productId, 'Purchase Product');
  }
  for (const adjustment of data.stockAdjustments) {
    requireSameInventory(adjustment.inventoryId, inventoryId, 'Adjustment');
    requireReference(products, adjustment.productId, 'Adjustment Product');
  }

  validateSaleItems(data.sales, data.saleItems, products, sales);
  validateMovements(
    data.inventoryMovements,
    inventoryId,
    products,
    sales,
    purchases,
    adjustments,
    movements,
    data.saleItems,
  );
}

function validateInventoryStates(
  states: readonly BackupInventoryStateV1[],
  products: ReadonlyMap<string, BackupProductV1>,
  inventoryId: string,
): void {
  const stateProducts = new Set<string>();
  for (const state of states) {
    requireSameInventory(state.inventoryId, inventoryId, 'InventoryState');
    requireReference(products, state.productId, 'InventoryState Product');
    if (stateProducts.has(state.productId)) {
      invalid('Backup contains a duplicate InventoryState.');
    }
    stateProducts.add(state.productId);
  }
  if (stateProducts.size !== products.size) {
    invalid('Every Product must have exactly one InventoryState.');
  }
}

function validateActiveBarcodes(products: readonly BackupProductV1[]): void {
  const activeBarcodes = new Set<string>();
  for (const product of products) {
    if (product.isArchived || product.barcode === null) continue;
    if (activeBarcodes.has(product.barcode)) {
      invalid('Backup contains a duplicate active Product barcode.');
    }
    activeBarcodes.add(product.barcode);
  }
}

function validateSaleItems(
  sales: readonly BackupSaleV1[],
  saleItems: readonly BackupSaleItemV1[],
  products: ReadonlyMap<string, BackupProductV1>,
  salesById: ReadonlyMap<string, BackupSaleV1>,
): void {
  const itemsBySale = new Map<string, BackupSaleItemV1[]>();
  for (const item of saleItems) {
    requireReference(salesById, item.saleId, 'SaleItem Sale');
    requireReference(products, item.productId, 'SaleItem Product');
    const items = itemsBySale.get(item.saleId) ?? [];
    if (items.some(({ productId }) => productId === item.productId)) {
      invalid('A Sale cannot contain the same Product more than once.');
    }
    items.push(item);
    itemsBySale.set(item.saleId, items);
  }

  for (const sale of sales) {
    const items = itemsBySale.get(sale.id) ?? [];
    if (items.length === 0)
      invalid('Every Sale must contain at least one SaleItem.');

    const total = sumSafe(
      items.map(({ subtotalUnits }) => subtotalUnits),
      'Sale total',
    );
    if (total !== sale.totalAmountUnits) {
      invalid('Sale total must equal the sum of its SaleItems.');
    }

    const allCostsKnown = items.every(
      ({ costStatus }) => costStatus === 'KNOWN',
    );
    if (!allCostsKnown) {
      if (
        sale.estimatedCostUnits !== null ||
        sale.estimatedProfitUnits !== null
      ) {
        invalid(
          'A Sale with unknown item cost must have unavailable estimates.',
        );
      }
      continue;
    }

    const estimatedCost = sumSafe(
      items.map(({ estimatedCostUnits }) => estimatedCostUnits!),
      'Sale estimated cost',
    );
    const estimatedProfit = sumSafe(
      items.map(({ estimatedProfitUnits }) => estimatedProfitUnits!),
      'Sale estimated profit',
    );
    if (
      sale.estimatedCostUnits !== estimatedCost ||
      sale.estimatedProfitUnits !== estimatedProfit
    ) {
      invalid('Sale estimates must equal the sum of its SaleItems.');
    }
  }
}

function validateMovements(
  movementRows: readonly BackupInventoryMovementV1[],
  inventoryId: string,
  products: ReadonlyMap<string, BackupProductV1>,
  sales: ReadonlyMap<string, BackupSaleV1>,
  purchases: ReadonlyMap<string, BackupPurchaseV1>,
  adjustments: ReadonlyMap<string, BackupStockAdjustmentV1>,
  movements: ReadonlyMap<string, BackupInventoryMovementV1>,
  saleItems: readonly BackupSaleItemV1[],
): void {
  const reversalsByOriginal = new Map<string, BackupInventoryMovementV1>();
  const operationMovementKeys = new Set<string>();

  for (const movement of movementRows) {
    requireSameInventory(movement.inventoryId, inventoryId, 'Movement');
    requireReference(products, movement.productId, 'Movement Product');
    if (movement.updatedAt < movement.createdAt) {
      invalid('Movement updatedAt must not be before createdAt.');
    }

    if (movement.type === 'INITIAL_STOCK') {
      if (
        movement.sourceType !== null ||
        movement.sourceId !== null ||
        movement.quantityDelta <= 0 ||
        movement.stockBefore !== 0 ||
        movement.unitCostSnapshotUnits === null
      ) {
        invalid('INITIAL_STOCK movement has invalid V1 semantics.');
      }
      continue;
    }

    if (movement.type === 'REVERSAL') {
      if (
        movement.sourceType !== 'INVENTORY_MOVEMENT' ||
        movement.sourceId === null
      ) {
        invalid('REVERSAL movement must reference an InventoryMovement.');
      }
      if (reversalsByOriginal.has(movement.sourceId)) {
        invalid('An InventoryMovement cannot have multiple REVERSAL records.');
      }
      const original = requireReference(
        movements,
        movement.sourceId,
        'REVERSAL original movement',
      );
      if (
        (original.type !== 'SALE' && original.type !== 'PURCHASE') ||
        original.inventoryId !== movement.inventoryId ||
        original.productId !== movement.productId ||
        original.quantityDelta !== -movement.quantityDelta ||
        original.unitCostSnapshotUnits !== movement.unitCostSnapshotUnits
      ) {
        invalid('REVERSAL does not match its original movement exactly.');
      }
      reversalsByOriginal.set(movement.sourceId, movement);
      continue;
    }

    const sourceId = movement.sourceId!;
    const operationKey = `${movement.type}:${sourceId}:${movement.productId}`;
    if (operationMovementKeys.has(operationKey)) {
      invalid('Backup contains a duplicate operation movement.');
    }
    operationMovementKeys.add(operationKey);

    if (movement.type === 'PURCHASE') {
      const purchase = requireMovementSource(movement, 'PURCHASE', purchases);
      if (
        movement.quantityDelta !== purchase.quantity ||
        movement.productId !== purchase.productId ||
        movement.stockBefore !== purchase.stockBefore ||
        movement.stockAfter !== purchase.stockAfter ||
        movement.unitCostSnapshotUnits !== purchase.unitCostUnits
      ) {
        invalid('PURCHASE movement does not match its Purchase.');
      }
      continue;
    }

    if (movement.type === 'SALE') {
      requireMovementSource(movement, 'SALE', sales);
      const item = saleItems.find(
        ({ saleId, productId }) =>
          saleId === sourceId && productId === movement.productId,
      );
      if (
        item === undefined ||
        movement.quantityDelta !== -item.quantity ||
        movement.unitCostSnapshotUnits !== item.unitCostSnapshotUnits
      ) {
        invalid('SALE movement does not match its SaleItem.');
      }
      continue;
    }

    const adjustment = requireMovementSource(
      movement,
      'STOCK_ADJUSTMENT',
      adjustments,
    );
    const expectedType =
      adjustment.difference > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';
    if (
      movement.type !== expectedType ||
      movement.quantityDelta !== adjustment.difference ||
      movement.productId !== adjustment.productId ||
      movement.stockBefore !== adjustment.stockBefore ||
      movement.stockAfter !== adjustment.actualStock ||
      movement.unitCostSnapshotUnits !== adjustment.unitCostUnits
    ) {
      invalid('Adjustment movement does not match its StockAdjustment.');
    }
  }

  for (const purchase of purchases.values()) {
    const original = movementRows.find(
      ({ type, sourceType, sourceId }) =>
        type === 'PURCHASE' &&
        sourceType === 'PURCHASE' &&
        sourceId === purchase.id,
    );
    validateOperationReversalState(
      purchase.status,
      original,
      reversalsByOriginal,
      'Purchase',
    );
  }
  for (const sale of sales.values()) {
    const originals = movementRows.filter(
      ({ type, sourceType, sourceId }) =>
        type === 'SALE' && sourceType === 'SALE' && sourceId === sale.id,
    );
    const expectedItems = saleItems.filter(({ saleId }) => saleId === sale.id);
    if (originals.length !== expectedItems.length) {
      invalid('Sale must have exactly one movement per SaleItem.');
    }
    for (const original of originals) {
      validateOperationReversalState(
        sale.status,
        original,
        reversalsByOriginal,
        'Sale',
      );
    }
  }
  for (const adjustment of adjustments.values()) {
    const originals = movementRows.filter(
      ({ sourceType, sourceId }) =>
        sourceType === 'STOCK_ADJUSTMENT' && sourceId === adjustment.id,
    );
    if (originals.length !== 1) {
      invalid('StockAdjustment must have exactly one movement.');
    }
  }
}

function validateOperationReversalState(
  status: 'CONFIRMED' | 'VOIDED',
  original: BackupInventoryMovementV1 | undefined,
  reversals: ReadonlyMap<string, BackupInventoryMovementV1>,
  label: string,
): void {
  if (original === undefined)
    invalid(`${label} must have its original movement.`);
  const hasReversal = reversals.has(original.id);
  if ((status === 'VOIDED') !== hasReversal) {
    invalid(`${label} status does not match its REVERSAL records.`);
  }
}

function requireMovementSource<T>(
  movement: BackupInventoryMovementV1,
  sourceType: string,
  values: ReadonlyMap<string, T>,
): T {
  if (movement.sourceType !== sourceType || movement.sourceId === null) {
    invalid(`${movement.type} movement has an invalid source.`);
  }
  return requireReference(values, movement.sourceId, `${movement.type} source`);
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    invalid(`${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string') invalid(`${path} must be text.`);
  return value;
}

function requireNormalizedText(value: unknown, path: string): string {
  const text = requireString(value, path);
  if (text.length === 0 || text.trim() !== text) {
    invalid(`${path} must be non-empty normalized text.`);
  }
  return text;
}

function requireNullableString(value: unknown, path: string): string | null {
  if (value === null) return null;
  return requireString(value, path);
}

function requireNormalizedNullableText(
  value: unknown,
  path: string,
): string | null {
  if (value === null) return null;
  return requireNormalizedText(value, path);
}

function requireNullableNormalizedText(
  value: unknown,
  path: string,
): string | null {
  return requireNormalizedNullableText(value, path);
}

function requireId(value: unknown, path: string): string {
  return requireNormalizedText(value, path);
}

function requireNullableId(value: unknown, path: string): string | null {
  return value === null ? null : requireId(value, path);
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') invalid(`${path} must be boolean.`);
  return value;
}

function requireSafeInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    invalid(`${path} must be a safe integer.`);
  }
  return value;
}

function requirePositiveSafeInteger(value: unknown, path: string): number {
  const integer = requireSafeInteger(value, path);
  if (integer <= 0) invalid(`${path} must be greater than zero.`);
  return integer;
}

function requireNullableNonNegativeSafeInteger(
  value: unknown,
  path: string,
): number | null {
  if (value === null) return null;
  const integer = requireSafeInteger(value, path);
  if (integer < 0) invalid(`${path} must not be negative.`);
  return integer;
}

function requireTimestamp(value: unknown, path: string): number {
  const timestamp = requireSafeInteger(value, path);
  if (timestamp < 0) invalid(`${path} must not be negative.`);
  return timestamp;
}

function requireMoneyUnits(value: unknown, path: string): number {
  const units = requireSafeInteger(value, path);
  validateDomain(() => Money.fromScaledUnits(units), path);
  return units;
}

function requireNonNegativeMoneyUnits(value: unknown, path: string): number {
  const units = requireMoneyUnits(value, path);
  if (units < 0) invalid(`${path} must not be negative.`);
  return units;
}

function requirePositiveMoneyUnits(value: unknown, path: string): number {
  const units = requireMoneyUnits(value, path);
  if (units <= 0) invalid(`${path} must be greater than zero.`);
  return units;
}

function requireNullableMoneyUnits(
  value: unknown,
  path: string,
): number | null {
  return value === null ? null : requireMoneyUnits(value, path);
}

function requireNullableNonNegativeMoneyUnits(
  value: unknown,
  path: string,
): number | null {
  return value === null ? null : requireNonNegativeMoneyUnits(value, path);
}

function requireEnum(
  value: unknown,
  values: ReadonlySet<string>,
  path: string,
): string {
  const text = requireString(value, path);
  if (!values.has(text)) invalid(`${path} is not supported.`);
  return text;
}

function moneyOrNull(units: number | null): Money | null {
  return units === null ? null : Money.fromScaledUnits(units);
}

function validateDomain(operation: () => unknown, path: string): void {
  try {
    operation();
  } catch (error) {
    invalid(`${path} violates current domain invariants.`, error);
  }
}

function assertUniqueIds(
  values: readonly { readonly id: string }[],
  label: string,
): void {
  const ids = new Set<string>();
  for (const { id } of values) {
    if (ids.has(id)) invalid(`Backup contains a duplicate ${label} ID.`);
    ids.add(id);
  }
}

function indexById<T extends { readonly id: string }>(
  values: readonly T[],
): ReadonlyMap<string, T> {
  return new Map(values.map((value) => [value.id, value]));
}

function requireReference<T>(
  values: ReadonlyMap<string, T>,
  id: string,
  label: string,
): T {
  const value = values.get(id);
  if (value === undefined) invalid(`${label} does not exist in the backup.`);
  return value;
}

function requireSameInventory(
  actual: string,
  expected: string,
  label: string,
): void {
  if (actual !== expected) invalid(`${label} belongs to another Inventory.`);
}

function sumSafe(values: readonly number[], label: string): number {
  let total = 0;
  for (const value of values) {
    total += value;
    if (!Number.isSafeInteger(total))
      invalid(`${label} exceeds safe integer range.`);
  }
  return total;
}

function invalid(message: string, cause?: unknown): never {
  throw new BackupValidationError('INVALID_DOCUMENT', message, { cause });
}
