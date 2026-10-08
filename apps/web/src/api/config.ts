export function parseApiUrl(value: string | undefined): string {
  if (!value?.trim())
    throw new Error('Configura VITE_API_URL para usar la API.');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('VITE_API_URL debe ser una URL HTTP o HTTPS válida.');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error(
      'VITE_API_URL debe contener solo el origen público de la API.',
    );
  return url.origin;
}

export function readApiConfig(env: Readonly<{ VITE_API_URL?: string }>) {
  return { apiUrl: parseApiUrl(env.VITE_API_URL) };
}
