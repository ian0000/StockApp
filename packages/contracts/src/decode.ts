import { Ajv2020 } from 'ajv/dist/2020.js';
import type { JSONSchema, FromSchema } from 'json-schema-to-ts';
import { commandEnvelopeSchema, type CommandEnvelopeV1 } from './commands.js';
import { pushRequestSchema } from './sync.js';

const validator = new Ajv2020({
  strict: true,
  allErrors: false,
  coerceTypes: false,
  removeAdditional: false,
  useDefaults: false,
});

export function createSchemaValidator(
  schema: JSONSchema,
): (input: unknown) => void {
  const validate = validator.compile(schema);
  return (input: unknown) => {
    if (!validate(input))
      throw new TypeError('Input does not match the V1 transport contract.');
  };
}

function requireUnique(values: readonly string[]): void {
  if (
    new Set(values.map((value) => value.toLowerCase())).size !== values.length
  )
    throw new TypeError('Duplicate identities are not allowed.');
}

function requireSameProducts(
  actual: readonly string[],
  expected: readonly string[],
): void {
  requireUnique(actual);
  requireUnique(expected);
  if (
    actual.length !== expected.length ||
    actual.some(
      (id) =>
        !expected.some((other) => other.toLowerCase() === id.toLowerCase()),
    )
  )
    throw new TypeError('Evidence must describe exactly the command products.');
}

const validateEnvelope = createSchemaValidator(commandEnvelopeSchema);
export function decodeCommandEnvelope(input: unknown): CommandEnvelopeV1 {
  validateEnvelope(input);
  // The validator checks the exact schema from which CommandEnvelopeV1 is derived.
  const command = input as CommandEnvelopeV1;
  const { dependsOn, operationId } = command;
  const canonicalOperationId = operationId.toLowerCase();
  if (
    dependsOn.some((id) => id.toLowerCase() === canonicalOperationId) ||
    command.supersedesOperationId?.toLowerCase() === canonicalOperationId
  )
    throw new TypeError('A command cannot depend on or supersede itself.');
  requireUnique(dependsOn);
  const newIds: string[] = [operationId];
  switch (command.commandKind) {
    case 'PRODUCT_CREATE':
      newIds.push(command.payload.productId);
      if (command.payload.initialStock > 0) {
        if (
          command.payload.initialMovementId === null ||
          command.payload.initialUnitCost === null
        )
          throw new TypeError(
            'Initial stock requires its movement identity and cost.',
          );
        newIds.push(command.payload.initialMovementId);
      } else if (command.payload.initialMovementId !== null)
        throw new TypeError('Zero initial stock has no movement.');
      break;
    case 'SALE_REGISTER':
      newIds.push(command.payload.saleId);
      for (const line of command.payload.items)
        newIds.push(line.saleItemId, line.movementId);
      requireSameProducts(
        command.payload.items.map((line) => line.productId),
        command.preconditions.expectedCosts.map((line) => line.productId),
      );
      for (const evidence of command.preconditions.expectedCosts) {
        if (
          evidence.unitCostSnapshot === null &&
          (evidence.estimatedCost !== null || evidence.estimatedProfit !== null)
        )
          throw new TypeError('Unknown cost evidence must stay null.');
        if (
          evidence.unitCostSnapshot !== null &&
          (evidence.estimatedCost === null || evidence.estimatedProfit === null)
        )
          throw new TypeError('Known cost evidence requires totals.');
      }
      break;
    case 'PURCHASE_REGISTER':
      newIds.push(command.payload.purchaseId, command.payload.movementId);
      break;
    case 'STOCK_ADJUST':
      newIds.push(
        command.payload.stockAdjustmentId,
        command.payload.movementId,
      );
      break;
    case 'SALE_VOID':
      newIds.push(
        ...command.payload.reversalMovements.map((line) => line.movementId),
      );
      requireSameProducts(
        command.payload.reversalMovements.map((line) => line.productId),
        command.preconditions.states.map((line) => line.productId),
      );
      break;
    case 'PURCHASE_VOID':
      newIds.push(command.payload.reversalMovementId);
      break;
    case 'PRODUCT_UPDATE':
    case 'PRODUCT_ARCHIVE':
      break;
  }
  requireUnique(newIds);
  const expectedRevisions =
    'expectedStateRevision' in command.preconditions
      ? [command.preconditions.expectedStateRevision]
      : 'states' in command.preconditions
        ? command.preconditions.states.map(
            (state) => state.expectedStateRevision,
          )
        : [];
  for (const revision of expectedRevisions) {
    if (
      typeof revision !== 'string' &&
      !dependsOn.some(
        (id) => id.toLowerCase() === revision.operationId.toLowerCase(),
      )
    )
      throw new TypeError(
        'Receipt revision references must belong to dependsOn.',
      );
  }
  // This function validates transport identities/evidence, never recomputes financial results.
  return command;
}

const validatePush = createSchemaValidator(pushRequestSchema);
export function decodePushRequest(input: unknown) {
  validatePush(input);
  const push = input as FromSchema<typeof pushRequestSchema>;
  const commands = push.commands.map(decodeCommandEnvelope);
  requireUnique(commands.map((command) => command.operationId));
  for (const command of commands) {
    if (command.deviceId?.toLowerCase() !== push.deviceId.toLowerCase())
      throw new TypeError('Sync commands must identify the registered device.');
  }
  return { ...push, commands };
}
