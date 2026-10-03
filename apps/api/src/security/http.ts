import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';
import { SecurityError } from './policy.js';

export function registerSecurityTransport(
  app: FastifyInstance,
  appOrigin: string,
): void {
  app.addHook('onRequest', async (request) => {
    if (
      request.method === 'OPTIONS' &&
      request.url.startsWith('/v1/') &&
      (!request.headers.origin ||
        !request.headers['access-control-request-method'])
    )
      throw new SecurityError(400, 'VALIDATION_ERROR');
    if (
      request.url.startsWith('/v1/') &&
      request.headers.origin !== undefined &&
      request.headers.origin !== appOrigin
    )
      throw new SecurityError(403, 'ORIGIN_NOT_ALLOWED');
    if (
      request.url.startsWith('/v1/') &&
      ['POST', 'PUT', 'PATCH'].includes(request.method) &&
      request.headers['content-type']?.split(';')[0].trim().toLowerCase() !==
        'application/json'
    )
      throw new SecurityError(415, 'UNSUPPORTED_MEDIA_TYPE');
  });
  app.register(cors, {
    origin: [appOrigin],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'Idempotency-Key'],
    exposedHeaders: ['X-Request-Id', 'Retry-After', 'X-Retry-After'],
    strictPreflight: true,
    preflightContinue: false,
  });
}
