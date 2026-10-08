import { createHmac, timingSafeEqual } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { ApiErrorCode } from '@stock-app/contracts';
import type { createDatabase } from '../infrastructure/postgres/client.js';

export class SecurityError extends Error {
  constructor(
    readonly statusCode: 400 | 403 | 415 | 429,
    readonly code: ApiErrorCode,
    readonly retryAfter?: number,
  ) {
    super('No pudimos aceptar la solicitud.');
  }
}

export function createRateKeyHasher(secret: string) {
  const rateKey = createHmac('sha256', secret)
    .update('stockapp:rate-key:v1')
    .digest();
  return (scope: string, key: string) =>
    createHmac('sha256', rateKey)
      .update(JSON.stringify([scope, key]))
      .digest('hex');
}

export function createSecurity(
  database: ReturnType<typeof createDatabase>,
  secret: string,
  clock: () => number = Date.now,
) {
  const rateHash = createRateKeyHasher(secret);
  const csrfKey = createHmac('sha256', secret)
    .update('stockapp:csrf-key:v1')
    .digest();
  return {
    // A fixed window starts on the first attempt. PostgreSQL serializes conflicting upserts.
    // Rejected attempts do not extend the window, and counters saturate to avoid overflow.
    async consume(
      scope: string,
      key: string,
      rule: { window: number; max: number },
    ) {
      const keyHash = rateHash(scope, key);
      const now = clock();
      if (
        !Number.isSafeInteger(now) ||
        now < 0 ||
        !Number.isSafeInteger(rule.max) ||
        rule.max < 1 ||
        rule.max >= 2147483647 ||
        !Number.isSafeInteger(rule.window) ||
        rule.window < 1
      )
        throw new Error('Invalid security policy.');
      const expiry = now + rule.window * 1000;
      if (!Number.isSafeInteger(expiry))
        throw new Error('Invalid security clock.');
      const result = await database.execute<{
        count: number;
        expires_at: string;
      }>(sql`
        INSERT INTO security_rate_limits (scope, key_hash, count, expires_at)
        VALUES (${scope}, ${keyHash}, 1, ${expiry})
        ON CONFLICT (scope, key_hash) DO UPDATE SET
          count = CASE WHEN security_rate_limits.expires_at <= ${now} THEN 1
            ELSE LEAST(security_rate_limits.count + 1, ${rule.max + 1}) END,
          expires_at = CASE WHEN security_rate_limits.expires_at <= ${now} THEN ${expiry}
            ELSE security_rate_limits.expires_at END
        RETURNING count, expires_at
      `);
      const row = result.rows[0];
      if (!row) throw new Error('Security storage unavailable.');
      const allowed = row.count <= rule.max;
      return {
        allowed,
        retryAfter: allowed
          ? null
          : Math.max(1, Math.ceil((Number(row.expires_at) - now) / 1000)),
      };
    },
    csrf(sessionId: string): string {
      return createHmac('sha256', csrfKey)
        .update(JSON.stringify(['stockapp:session-csrf:v1', sessionId]))
        .digest('base64url');
    },
    verifyCsrf(sessionId: string, token: string | string[] | undefined): void {
      const expected = this.csrf(sessionId);
      if (
        typeof token !== 'string' ||
        !/^[A-Za-z0-9_-]{43}$/.test(token) ||
        !timingSafeEqual(Buffer.from(token), Buffer.from(expected))
      )
        throw new SecurityError(403, 'CSRF_TOKEN_INVALID');
    },
  };
}

export type SecurityPolicy = ReturnType<typeof createSecurity>;
