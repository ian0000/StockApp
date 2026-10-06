import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildApp } from './app.js';
import { readServerConfig } from './config.js';
import { createAuthRuntime } from './auth/runtime.js';
import { registerAuthRoutes } from './auth/routes.js';
import { registerSaleRoutes } from './sales/routes.js';
import { registerPurchaseRoutes } from './purchases/routes.js';
import { registerAdjustmentRoutes } from './adjustments/routes.js';
import { registerVoidSaleRoutes } from './void-sales/routes.js';
import { registerVoidPurchaseRoutes } from './void-purchases/routes.js';
import { registerProductRoutes } from './products/routes.js';
import { registerOwnershipRoutes } from './ownership/routes.js';

export async function startServer(): Promise<void> {
  const app = buildApp({ logger: true });
  let closing = false;
  async function shutdown(): Promise<void> {
    if (closing) return;
    closing = true;
    try {
      await app.close();
    } catch {
      app.log.error('Could not close HTTP server.');
      process.exitCode = 1;
    } finally {
      process.removeListener('SIGINT', shutdown);
      process.removeListener('SIGTERM', shutdown);
    }
  }
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  try {
    if (process.env.AUTH_BASE_URL) {
      const runtime = createAuthRuntime(process.env, () => {
        app.log.error(
          { code: 'AUTH_EMAIL_FAILED' },
          'Could not send authentication email.',
        );
      });
      app.addHook('onClose', () => runtime.close());
      registerAuthRoutes(app, runtime.auth, runtime.config);
      registerOwnershipRoutes(app, runtime.auth, runtime.database);
      registerProductRoutes(app, runtime.auth, runtime.database);
      registerSaleRoutes(app, runtime.auth, runtime.database);
      registerPurchaseRoutes(app, runtime.auth, runtime.database);
      registerAdjustmentRoutes(app, runtime.auth, runtime.database);
      registerVoidSaleRoutes(app, runtime.auth, runtime.database);
      registerVoidPurchaseRoutes(app, runtime.auth, runtime.database);
    }
    await app.listen(readServerConfig(process.env));
  } catch {
    app.log.error(
      'Could not start HTTP server. Check server and auth configuration.',
    );
    process.exitCode = 1;
    await shutdown();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await startServer();
}
