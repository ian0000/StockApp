import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildApp } from './app.js';
import { readServerConfig } from './config.js';

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
    await app.listen(readServerConfig(process.env));
  } catch {
    app.log.error('Could not start HTTP server. Check HOST and PORT.');
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
