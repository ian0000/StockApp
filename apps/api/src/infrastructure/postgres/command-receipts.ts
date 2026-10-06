import { and, eq } from 'drizzle-orm';
import {
  COMMAND_KINDS,
  createApiError,
  createSchemaValidator,
  decodeUuid,
  revisionSchema,
  uuidSchema,
  uuidV7Schema,
  sha256Schema,
  type CommandEnvelopeV1,
  type OperationReceipt,
} from '@stock-app/contracts';
import type { createDatabase } from './client.js';
import { inventoryChangeSets, operationReceipts } from './schema.js';
import { restoreChangeSet } from './change-sets.js';

type CommandKind = CommandEnvelopeV1['commandKind'];
type DatabaseReader = Pick<ReturnType<typeof createDatabase>, 'select'>;
export type AcceptedReferences =
  | Pick<
      Extract<CommandEnvelopeV1, { commandKind: 'PRODUCT_CREATE' }>['payload'],
      'productId'
    >
  | Pick<
      Extract<CommandEnvelopeV1, { commandKind: 'SALE_REGISTER' }>['payload'],
      'saleId'
    >
  | Pick<
      Extract<
        CommandEnvelopeV1,
        { commandKind: 'PURCHASE_REGISTER' }
      >['payload'],
      'purchaseId'
    >
  | Pick<
      Extract<CommandEnvelopeV1, { commandKind: 'STOCK_ADJUST' }>['payload'],
      'stockAdjustmentId'
    >;

function referenceSchema(
  field: string,
  identity: typeof uuidSchema | typeof uuidV7Schema,
) {
  return {
    type: 'object',
    properties: { [field]: identity },
    required: [field],
    additionalProperties: false,
  } as const;
}
export const acceptedReferencesSchemas = {
  PRODUCT_CREATE: referenceSchema('productId', uuidV7Schema),
  PRODUCT_UPDATE: referenceSchema('productId', uuidSchema),
  PRODUCT_ARCHIVE: referenceSchema('productId', uuidSchema),
  SALE_REGISTER: referenceSchema('saleId', uuidV7Schema),
  PURCHASE_REGISTER: referenceSchema('purchaseId', uuidV7Schema),
  STOCK_ADJUST: referenceSchema('stockAdjustmentId', uuidV7Schema),
  SALE_VOID: referenceSchema('saleId', uuidSchema),
  PURCHASE_VOID: referenceSchema('purchaseId', uuidSchema),
} as const;
const acceptedValidators = Object.fromEntries(
  Object.entries(acceptedReferencesSchemas).map(([kind, schema]) => [
    kind,
    createSchemaValidator(schema),
  ]),
);
const conflictCodes = ['REVISION_CONFLICT', 'COST_SNAPSHOT_CONFLICT'] as const;
const rejectedCodes = [
  'DOMAIN_RULE',
  'VOID_NOT_ELIGIBLE',
  'MONEY_OVERFLOW',
  'NOT_FOUND',
] as const;
export type TerminalReferences = {
  errorCode: (typeof conflictCodes)[number] | (typeof rejectedCodes)[number];
  currentRevision?: string;
};
function terminalSchema(codes: readonly TerminalReferences['errorCode'][]) {
  return {
    type: 'object',
    properties: {
      errorCode: { type: 'string', enum: codes },
      currentRevision: revisionSchema,
    },
    required: ['errorCode'],
    additionalProperties: false,
    allOf: [
      {
        if: {
          properties: { currentRevision: true },
          required: ['currentRevision'],
        },
        then: { properties: { errorCode: { const: 'REVISION_CONFLICT' } } },
      },
    ],
  } as const;
}
export const terminalReferencesSchemas = {
  CONFLICT: terminalSchema(conflictCodes),
  REJECTED: terminalSchema(rejectedCodes),
} as const;
const terminalValidators = {
  CONFLICT: createSchemaValidator(terminalReferencesSchemas.CONFLICT),
  REJECTED: createSchemaValidator(terminalReferencesSchemas.REJECTED),
};
const validateHash = createSchemaValidator(sha256Schema);
const messages: Readonly<Record<TerminalReferences['errorCode'], string>> = {
  REVISION_CONFLICT: 'El inventario cambió. Revisa los datos.',
  COST_SNAPSHOT_CONFLICT: 'El costo cambió. Revisa la operación.',
  DOMAIN_RULE: 'Revisa los datos de la operación.',
  VOID_NOT_ELIGIBLE: 'No podemos anular esta operación.',
  MONEY_OVERFLOW: 'El importe supera el rango permitido.',
  NOT_FOUND: 'No encontramos esta operación.',
};
export function validateTerminalReferences(
  value: unknown,
  status: 'CONFLICT' | 'REJECTED',
): asserts value is TerminalReferences {
  terminalValidators[status](value);
}
export function validateAcceptedReferences(
  kind: CommandKind,
  value: unknown,
): void {
  const validator = acceptedValidators[kind];
  if (!validator) throw new Error('Unknown receipt kind.');
  validator(value);
}
export function commandReferences(
  command: CommandEnvelopeV1,
): AcceptedReferences {
  switch (command.commandKind) {
    case 'PRODUCT_CREATE':
    case 'PRODUCT_UPDATE':
    case 'PRODUCT_ARCHIVE':
      return { productId: command.payload.productId };
    case 'SALE_REGISTER':
    case 'SALE_VOID':
      return { saleId: command.payload.saleId };
    case 'PURCHASE_REGISTER':
    case 'PURCHASE_VOID':
      return { purchaseId: command.payload.purchaseId };
    case 'STOCK_ADJUST':
      return { stockAdjustmentId: command.payload.stockAdjustmentId };
  }
}
export function terminalReceipt(
  operationId: string,
  status: 'CONFLICT' | 'REJECTED',
  references: TerminalReferences,
  requestId: string,
): OperationReceipt {
  validateTerminalReferences(references, status);
  const envelope = createApiError(
    references.errorCode,
    messages[references.errorCode],
    requestId,
  );
  if (references.currentRevision !== undefined)
    envelope.error.details = { currentRevision: references.currentRevision };
  return { operationId, status, error: envelope.error };
}

export async function findOperationReceipt(
  database: DatabaseReader,
  scope: { businessId: string; inventoryId: string },
  operationId: string,
  requestId: string,
) {
  const [row] = await database
    .select()
    .from(operationReceipts)
    .where(
      and(
        eq(operationReceipts.businessId, scope.businessId),
        eq(operationReceipts.operationId, operationId),
      ),
    );
  if (!row) return null;
  decodeUuid(row.businessId, 7);
  decodeUuid(row.operationId, 7);
  if (row.deviceId !== null) decodeUuid(row.deviceId, 7);
  validateHash(row.payloadHash);
  if (
    !Number.isSafeInteger(row.receivedAt.getTime()) ||
    row.receivedAt.getTime() < 0
  )
    throw new Error('Invalid receipt metadata.');
  const kind = COMMAND_KINDS.find((candidate) => candidate === row.kind);
  if (!kind) throw new Error('Unknown stored command kind.');
  let result: OperationReceipt;
  if (row.resultCode === 'ACCEPTED') {
    validateAcceptedReferences(kind, row.resultReferences);
    if (
      typeof row.committedRevision !== 'bigint' ||
      row.committedRevision <= 0n
    )
      throw new Error('Invalid accepted receipt revision.');
    const [change] = await database
      .select()
      .from(inventoryChangeSets)
      .where(
        and(
          eq(inventoryChangeSets.inventoryId, scope.inventoryId),
          eq(inventoryChangeSets.revision, row.committedRevision),
        ),
      );
    if (!change) throw new Error('Missing committed ChangeSet.');
    result = {
      operationId: row.operationId,
      status: 'ACCEPTED',
      changeSet: restoreChangeSet(
        change,
        scope.inventoryId,
        row.committedRevision,
      ),
    };
  } else if (row.resultCode === 'CONFLICT' || row.resultCode === 'REJECTED') {
    if (row.committedRevision !== null)
      throw new Error('Invalid terminal receipt revision.');
    validateTerminalReferences(row.resultReferences, row.resultCode);
    result = terminalReceipt(
      row.operationId,
      row.resultCode,
      row.resultReferences,
      requestId,
    );
  } else throw new Error('Unknown stored receipt status.');
  return { row, result };
}
