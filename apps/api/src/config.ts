export function readUatBootstrapPolicy(env: NodeJS.ProcessEnv) {
  const value = env.UAT_AUTO_ENABLE_CLOUD_ACCESS;
  if (value === undefined || value === 'false')
    return { autoEnableCloudAccess: false };
  if (
    value !== 'true' ||
    env.RAILWAY_ENVIRONMENT_NAME !== 'uat' ||
    env.APP_ORIGIN !== 'https://stockapp-staging.ian-k.dev' ||
    env.AUTH_BASE_URL !== 'https://api-stockapp-staging.ian-k.dev'
  )
    throw new TypeError(
      'Automatic cloud access is restricted to StockApp UAT.',
    );
  return { autoEnableCloudAccess: true };
}

export function readServerConfig(env: NodeJS.ProcessEnv) {
  const host = env.HOST ?? '0.0.0.0';
  const portValue = env.PORT ?? '3001';
  if (host.trim().length === 0) {
    throw new TypeError('HOST must not be empty.');
  }
  if (!/^[0-9]+$/.test(portValue)) {
    throw new TypeError('PORT must be an integer from 1 to 65535.');
  }
  const port = Number(portValue);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new TypeError('PORT must be an integer from 1 to 65535.');
  }
  return { host, port };
}
