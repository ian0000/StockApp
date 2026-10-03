import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyInstance } from 'fastify';
import { nativeOrigin, type AuthConfig } from './config.js';
import type { StockAppAuth } from './create-auth.js';

export function registerAuthRoutes(
  app: FastifyInstance,
  auth: StockAppAuth,
  config: AuthConfig,
): void {
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      reply.header('cache-control', 'no-store');
      const headers = fromNodeHeaders(request.headers);
      // Header conflicts must not broaden the configured origins. Better Auth also checks
      // Referer/redirect URLs and CSRF; its protections remain enabled.
      for (const name of ['origin', 'expo-origin']) {
        const origin = headers.get(name);
        if (
          origin &&
          ![config.baseURL, config.appOrigin, nativeOrigin].includes(origin)
        ) {
          return reply
            .code(403)
            .send({ code: 'INVALID_ORIGIN', message: 'Invalid origin' });
        }
      }
      const url = new URL(request.url, config.baseURL);
      // Never derive auth URLs or redirects from a client-controlled Host header.
      url.protocol = new URL(config.baseURL).protocol;
      url.host = new URL(config.baseURL).host;
      const webRequest = new Request(url, {
        method: request.method,
        headers,
        ...(request.body !== undefined
          ? { body: JSON.stringify(request.body) }
          : {}),
      });
      const response = await auth.handler(webRequest);
      if (response.status >= 500) {
        request.log.error(
          { requestId: request.id, code: 'AUTH_INTERNAL_ERROR' },
          'Authentication failed.',
        );
        return reply.code(500).send({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Authentication could not be completed.',
        });
      }
      response.headers.forEach((value, name) => {
        if (!['set-cookie', 'x-request-id', 'cache-control'].includes(name))
          reply.header(name, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) reply.header('set-cookie', cookies);
      return reply.code(response.status).send(await response.text());
    },
  });
}
