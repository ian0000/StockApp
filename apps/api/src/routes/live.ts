import type { FastifyInstance } from 'fastify';
import { liveResponseSchema, type LiveResponse } from '@stock-app/contracts';

export function registerLiveRoute(app: FastifyInstance): void {
  app.get<{ Reply: LiveResponse }>(
    '/live',
    {
      schema: { response: { 200: liveResponseSchema } },
    },
    async () => ({ status: 'ok' }),
  );
}
