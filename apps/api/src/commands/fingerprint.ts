import { createHash } from 'node:crypto';
import {
  decodeCommandEnvelope,
  decodeUuid,
  type CommandEnvelopeV1,
} from '@stock-app/contracts';
import { CommandError } from './errors.js';

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value))
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null)
    return `{${Object.keys(value)
      .sort()
      .map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !('value' in descriptor))
          throw new TypeError('Expected JSON data.');
        return `${JSON.stringify(key)}:${canonicalJson(descriptor.value)}`;
      })
      .join(',')}}`;
  throw new TypeError('Expected JSON data.');
}

export function commandFingerprint(
  inventoryId: string,
  input: unknown,
): string {
  const command = decodeCommandEnvelope(input);
  const inventory = decodeUuid(inventoryId);
  // Preserve every envelope value, including UUID spelling; only object keys are sorted.
  return createHash('sha256')
    .update('stockapp-command-v1\0')
    .update(canonicalJson({ inventoryId: inventory, command }))
    .digest('hex');
}

export function requireIdempotencyKey(
  header: string | string[] | undefined,
  command: CommandEnvelopeV1,
): void {
  try {
    const operationId = decodeUuid(command.operationId, 7);
    const key = decodeUuid(header, 7);
    if (key.toLowerCase() !== operationId.toLowerCase())
      throw new TypeError('Mismatched identity.');
  } catch {
    throw new CommandError(400, 'VALIDATION_ERROR');
  }
}
