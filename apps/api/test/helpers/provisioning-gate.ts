import { randomUUID } from 'node:crypto';
import { createServer, type ServerResponse } from 'node:http';

export async function createProvisioningGate() {
  const token = randomUUID();
  const queue: ServerResponse[] = [];
  let active: ServerResponse | undefined;
  let closing = false;
  function grant() {
    if (closing || active) return;
    const next = queue.shift();
    if (!next) return;
    active = next;
    // Keep the response open for the lease. Worker exit also releases it.
    next.setHeader('x-provisioning-lease', randomUUID());
    next.writeHead(200, { 'content-type': 'application/octet-stream' });
    next.flushHeaders();
  }
  const server = createServer((request, response) => {
    if (
      closing ||
      request.method !== 'POST' ||
      !['/provision', '/provision/release'].includes(request.url ?? '') ||
      request.headers.authorization !== `Bearer ${token}`
    ) {
      response.writeHead(403).end();
      return;
    }
    if (request.url === '/provision/release') {
      if (
        !active ||
        request.headers['x-provisioning-lease'] !==
          active.getHeader('x-provisioning-lease')
      ) {
        response.writeHead(409).end();
        return;
      }
      active.end();
      active = undefined;
      grant();
      response.writeHead(204).end();
      return;
    }
    response.once('close', () => {
      if (active === response) active = undefined;
      else {
        const index = queue.indexOf(response);
        if (index !== -1) queue.splice(index, 1);
      }
      grant();
    });
    queue.push(response);
    grant();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Invalid provisioning gate address.');
  return {
    server,
    url: `http://127.0.0.1:${address.port}/provision`,
    token,
    async close() {
      closing = true;
      const occupied = active !== undefined || queue.length > 0;
      active?.end();
      for (const response of queue) response.writeHead(503).end();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      if (occupied) throw new Error('Provisioning lease was not released.');
    },
  };
}

export async function withProvisioningGate<T>(
  action: () => Promise<T>,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<T> {
  const url = env.TEST_PROVISIONING_URL;
  const token = env.TEST_PROVISIONING_TOKEN;
  if (!url && !token) return action();
  if (!url || !token) throw new Error('Incomplete test provisioning gate.');
  const lease = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  });
  if (!lease.ok || !lease.body) {
    await lease.body?.cancel();
    throw new Error('Test provisioning gate rejected acquisition.');
  }
  try {
    return await action();
  } finally {
    try {
      const released = await fetch(`${url}/release`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'x-provisioning-lease':
            lease.headers.get('x-provisioning-lease') ?? '',
        },
      });
      if (!released.ok)
        throw new Error('Test provisioning lease release failed.');
    } finally {
      await lease.body.cancel();
    }
  }
}
