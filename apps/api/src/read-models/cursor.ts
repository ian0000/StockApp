import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'node:crypto';
import { decodeUuid } from '@stock-app/contracts';
import { CommandError } from '../commands/errors.js';

export interface ReadScope {
  readonly inventoryId: string;
  readonly route: string;
  readonly search: string;
}
export interface ReadKey {
  readonly createdAt: number;
  readonly id: string;
  readonly effectiveAt?: number;
  readonly type?: 'SALE' | 'PURCHASE' | 'ADJUSTMENT';
}
export function createReadCursor(secret: string) {
  const key = createHmac('sha256', secret)
    .update('stockapp:read-cursor:v1')
    .digest();
  const scopeKey = (scope: ReadScope) =>
    JSON.stringify([scope.inventoryId, scope.route, scope.search]);
  return {
    encode(scope: ReadScope, position: ReadKey): string {
      const nonce = randomBytes(12),
        cipher = createCipheriv('aes-256-gcm', key, nonce);
      const ciphertext = Buffer.concat([
        cipher.update(
          JSON.stringify({ version: 1, scope: scopeKey(scope), position }),
          'utf8',
        ),
        cipher.final(),
      ]);
      return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString(
        'base64url',
      );
    },
    decode(token: string | undefined, scope: ReadScope): ReadKey | undefined {
      if (token === undefined) return undefined;
      try {
        if (!/^[A-Za-z0-9_-]+$/.test(token) || token.length > 4096)
          throw new TypeError();
        const bytes = Buffer.from(token, 'base64url');
        if (bytes.length < 29 || bytes.toString('base64url') !== token)
          throw new TypeError();
        const cipher = createDecipheriv(
          'aes-256-gcm',
          key,
          bytes.subarray(0, 12),
        );
        cipher.setAuthTag(bytes.subarray(12, 28));
        const value: unknown = JSON.parse(
          Buffer.concat([
            cipher.update(bytes.subarray(28)),
            cipher.final(),
          ]).toString('utf8'),
        );
        if (
          !value ||
          typeof value !== 'object' ||
          !('version' in value) ||
          value.version !== 1 ||
          !('scope' in value) ||
          value.scope !== scopeKey(scope) ||
          !('position' in value) ||
          !value.position ||
          typeof value.position !== 'object'
        )
          throw new TypeError();
        const p = value.position;
        if (
          !('id' in p) ||
          typeof p.id !== 'string' ||
          !('createdAt' in p) ||
          typeof p.createdAt !== 'number' ||
          !Number.isSafeInteger(p.createdAt) ||
          p.createdAt < 0
        )
          throw new TypeError();
        decodeUuid(p.id);
        if (scope.route === 'history') {
          if (
            !('effectiveAt' in p) ||
            typeof p.effectiveAt !== 'number' ||
            !Number.isSafeInteger(p.effectiveAt) ||
            p.effectiveAt < 0 ||
            !('type' in p) ||
            !['SALE', 'PURCHASE', 'ADJUSTMENT'].includes(String(p.type))
          )
            throw new TypeError();
          return {
            createdAt: p.createdAt,
            id: p.id,
            effectiveAt: p.effectiveAt,
            type:
              p.type === 'SALE'
                ? 'SALE'
                : p.type === 'PURCHASE'
                  ? 'PURCHASE'
                  : 'ADJUSTMENT',
          };
        }
        if ('effectiveAt' in p || 'type' in p) throw new TypeError();
        return { createdAt: p.createdAt, id: p.id };
      } catch {
        throw new CommandError(400, 'VALIDATION_ERROR');
      }
    },
  };
}
