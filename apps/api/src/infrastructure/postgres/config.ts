export function readDatabaseUrl(env: NodeJS.ProcessEnv): string {
  if (!env.DATABASE_URL?.trim()) throw new Error('DATABASE_URL is required.');
  return env.DATABASE_URL;
}

export function readTestDatabaseUrl(env: NodeJS.ProcessEnv): string {
  if (!env.TEST_DATABASE_URL?.trim())
    throw new Error('TEST_DATABASE_URL is required.');
  const message =
    'TEST_DATABASE_URL must identify a disposable local stockapp_test database without query options.';
  let url: URL;
  try {
    url = new URL(env.TEST_DATABASE_URL);
  } catch {
    throw new Error(message);
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    !/^\/stockapp_test(?:_[a-z0-9_]+)?$/.test(url.pathname) ||
    url.search ||
    url.hash
  ) {
    throw new Error(message);
  }
  return env.TEST_DATABASE_URL;
}
