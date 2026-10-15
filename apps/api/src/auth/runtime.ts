import {
  createPostgresPool,
  createDatabase,
} from '../infrastructure/postgres/client.js';
import { readDatabaseUrl } from '../infrastructure/postgres/config.js';
import { readAuthConfig } from './config.js';
import { createAuth } from './create-auth.js';
import { createEmailSender, readEmailConfig } from './email-provider.js';
import { readSuppressionSecret } from '../deletion/model.js';
import { createDeletionRunner } from '../deletion/runner.js';
import { createReadinessCheck } from '../infrastructure/postgres/readiness.js';

export function createAuthRuntime(
  env: Readonly<Record<string, string | undefined>>,
  onEmailFailure: () => void,
  onDeletionFailure: () => void = () => {},
) {
  const config = readAuthConfig(env);
  const suppressionSecret = readSuppressionSecret(env);
  const databaseURL = readDatabaseUrl(env);
  const emailConfig = readEmailConfig(env);
  const readiness = createReadinessCheck(databaseURL);
  const pool = createPostgresPool(databaseURL);
  const emailSender = createEmailSender(emailConfig);
  const database = createDatabase(pool);
  const runtime = createAuth({
    database,
    emailSender,
    config,
    onEmailFailure,
  });
  const deletionRunner = createDeletionRunner(
    database,
    { suppressionSecret, authSecret: config.secret },
    { onFailure: onDeletionFailure },
  );
  return {
    auth: runtime.auth,
    database,
    config,
    suppressionSecret,
    deletionRunner,
    readiness,
    drainEmails: runtime.drainEmails,
    async close(): Promise<void> {
      try {
        await readiness.close();
        await deletionRunner.close();
        await runtime.drainEmails();
      } finally {
        emailSender.close();
        await pool.end();
      }
    },
  };
}
