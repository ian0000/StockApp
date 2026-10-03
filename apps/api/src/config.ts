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
