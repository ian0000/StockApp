import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import type { BetterAuthOptions, DBTransactionAdapter } from 'better-auth';
import { APIError } from 'better-auth/api';
import type { createDatabase } from '../infrastructure/postgres/client.js';
import * as schema from '../infrastructure/postgres/schema.js';

function isEmailCollision(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (
    'code' in error &&
    error.code === '23505' &&
    'constraint' in error &&
    (error.constraint === 'user_email_unique' ||
      error.constraint === 'user_email_normalized_unique')
  )
    return true;
  return error.cause !== undefined && isEmailCollision(error.cause);
}

export function createAuthAdapter(database: ReturnType<typeof createDatabase>) {
  const config = { provider: 'pg', schema } as const;
  const official = drizzleAdapter(database, { ...config, transaction: true });
  return (options: BetterAuthOptions) => {
    const adapter = official(options);
    adapter.transaction = (run) =>
      database.transaction((tx) => {
        const transaction = drizzleAdapter(tx, config)(options);
        const create: DBTransactionAdapter['create'] = async (input) => {
          if (input.model !== 'user') return transaction.create(input);
          try {
            // Roll back only the failed insert before Better Auth returns its synthetic signup response.
            return await tx.transaction((savepoint) =>
              drizzleAdapter(savepoint, config)(options).create(input),
            );
          } catch (error) {
            if (isEmailCollision(error)) throw new APIError('FORBIDDEN');
            throw error;
          }
        };
        return run({ ...transaction, create });
      });
    return adapter;
  };
}
