import {
  createPostgresPool,
  createDatabase,
} from '../infrastructure/postgres/client.js';
import { createAuth } from './create-auth.js';
import { readAuthConfig } from './config.js';

// CLI-only, lazy and offline. Never import this fictional configuration into runtime.
const pool = createPostgresPool(
  'postgresql://postgres@127.0.0.1:1/stockapp_test',
);
export const auth = createAuth({
  database: createDatabase(pool),
  emailSender: { async send() {} },
  config: readAuthConfig({
    BETTER_AUTH_SECRET: 'fictional-schema-generation-only-secret',
    AUTH_BASE_URL: 'http://127.0.0.1:3001',
    APP_ORIGIN: 'http://localhost:5173',
  }),
}).auth;
