import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyInstance } from 'fastify';
import { nativeOrigin, type AuthConfig } from './config.js';
import type { StockAppAuth } from './create-auth.js';
import { registerSecurityTransport } from '../security/http.js';

export function registerAuthRoutes(
  app: FastifyInstance,
  auth: StockAppAuth,
  config: AuthConfig,
): void {
  registerSecurityTransport(app, config.appOrigin);
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      reply.header('cache-control', 'no-store');
      const headers = fromNodeHeaders(request.headers);
      // Only the socket address is authoritative until a verified proxy policy exists.
      headers.set('x-stockapp-client-ip', request.ip);
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
      let response: Response;
      try {
        // Match aliases normalized by the auth router, including trailing slashes.
        const path = decodeURIComponent(url.pathname).replace(/\/+$/, '');
        if (
          request.method === 'POST' &&
          [
            '/api/auth/sign-in/email',
            '/api/auth/sign-up/email',
            '/api/auth/request-password-reset',
            '/api/auth/send-verification-email',
            '/api/auth/reset-password',
          ].includes(path)
        ) {
          const ip = await auth.security.consume(
            'auth-sensitive-ip',
            request.ip,
            { window: 60, max: 30 },
          );
          if (!ip.allowed)
            return reply
              .code(429)
              .header('x-retry-after', ip.retryAfter ?? 60)
              .send({ message: 'Too many requests. Please try again later.' });
          let denied = ip;
          const body: unknown = request.body;
          if (
            body &&
            typeof body === 'object' &&
            'email' in body &&
            typeof body.email === 'string' &&
            [
              '/api/auth/sign-in/email',
              '/api/auth/request-password-reset',
            ].includes(path)
          ) {
            const reset = path === '/api/auth/request-password-reset';
            const email = await auth.security.consume(
              reset ? 'auth-reset-email' : 'auth-login-email',
              body.email.trim().toLowerCase(),
              { window: reset ? 3600 : 60, max: reset ? 3 : 5 },
            );
            if (!email.allowed) denied = email;
          }
          if (!denied.allowed)
            return reply
              .code(429)
              .header('x-retry-after', denied.retryAfter ?? 60)
              .send({ message: 'Too many requests. Please try again later.' });
        }
        response = await auth.handler(webRequest);
      } catch {
        return reply.code(500).send({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Authentication could not be completed.',
        });
      }
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
