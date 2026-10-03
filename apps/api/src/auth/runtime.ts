import {
  createPostgresPool,
  createDatabase,
} from '../infrastructure/postgres/client.js';
import { readDatabaseUrl } from '../infrastructure/postgres/config.js';
import { readAuthConfig } from './config.js';
import { createAuth } from './create-auth.js';
import { createSmtpSender, readSmtpConfig } from './email.js';

export function createAuthRuntime(
  env: Readonly<Record<string, string | undefined>>,
  onEmailFailure: () => void,
) {
  const config = readAuthConfig(env);
  const databaseURL = readDatabaseUrl(env);
  const smtpConfig = readSmtpConfig(env);
  const pool = createPostgresPool(databaseURL);
  const emailSender = createSmtpSender(smtpConfig);
  const runtime = createAuth({
    database: createDatabase(pool),
    emailSender,
    config,
    onEmailFailure,
  });
  return {
    auth: runtime.auth,
    config,
    drainEmails: runtime.drainEmails,
    async close(): Promise<void> {
      try {
        await runtime.drainEmails();
      } finally {
        emailSender.close();
        await pool.end();
      }
    },
  };
}
