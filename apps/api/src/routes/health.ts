import type { FastifyInstance } from 'fastify';
import {
  contractSchemas,
  createApiError,
  type LiveResponse,
  type ApiErrorEnvelope,
} from '@stock-app/contracts';

export function registerHealthRoute(
  app: FastifyInstance,
  ready: () => Promise<boolean>,
): void {
  app.get<{ Reply: { 200: LiveResponse; 503: ApiErrorEnvelope } }>(
    '/health',
    {
      schema: {
        response: {
          200: contractSchemas.Health,
        },
      },
    },
    async (request, reply) => {
      reply.header('cache-control', 'no-store');
      let available = false;
      try {
        available = await ready();
      } catch {
        /* Diagnostics stay private. */
      }
      if (available) return { status: 'ok' };
      return reply
        .code(503)
        .send(
          createApiError(
            'TEMPORARILY_UNAVAILABLE',
            'El servicio no está disponible temporalmente.',
            request.id,
          ),
        );
    },
  );
}
