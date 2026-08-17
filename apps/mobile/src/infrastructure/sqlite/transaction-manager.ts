import type {
  TransactionManager,
  TransactionRepositories,
} from '@stock-app/application';
import { drizzle } from 'drizzle-orm/expo-sqlite';

import type { AppDatabase } from './database';
import { createSqliteTransactionRepositories } from './repositories/repositories';
import * as schema from './schema';

export function createSqliteTransactionManager(
  database: Pick<AppDatabase, 'sqlite'>,
): TransactionManager {
  return {
    async runInTransaction<T>(
      operation: (repositories: TransactionRepositories) => Promise<T>,
    ): Promise<T> {
      let operationResult: { readonly value: T } | undefined;

      await database.sqlite.withExclusiveTransactionAsync(
        async (transaction) => {
          const executor = drizzle(transaction, { schema });
          const repositories = createSqliteTransactionRepositories(executor);

          operationResult = { value: await operation(repositories) };
        },
      );

      if (operationResult === undefined) {
        throw new Error('SQLite transaction completed without a result.');
      }

      return operationResult.value;
    },
  };
}
