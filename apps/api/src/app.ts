import { randomUUID } from 'node:crypto';
import type { Writable } from 'node:stream';
import Fastify from 'fastify';
import { apiErrorSchema, createApiError } from '@stock-app/contracts';
import { registerLiveRoute } from './routes/live.js';

export function buildApp(
  options: { logger?: boolean; logStream?: Writable } = {},
) {
  const app = Fastify({
    logger: options.logger
      ? {
          stream: options.logStream,
          serializers: {
            req: (request) => ({ method: request.method }),
            res: (reply) => ({ statusCode: reply.statusCode }),
            err: () => ({
              type: 'Error',
              message: 'Internal failure.',
              stack: '',
            }),
          },
        }
      : false,
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    exposeHeadRoutes: false,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  });

  app.addSchema({ $id: 'ApiErrorEnvelope', ...apiErrorSchema });
  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });
  app.setNotFoundHandler((_request, reply) => {
    return reply
      .code(404)
      .send(
        createApiError(
          'NOT_FOUND',
          'No encontramos esta ruta.',
          reply.request.id,
        ),
      );
  });
  app.setErrorHandler((error, request, reply) => {
    const validationError =
      error instanceof Error &&
      (('validation' in error && error.validation !== undefined) ||
        ('code' in error &&
          typeof error.code === 'string' &&
          [
            'FST_ERR_CTP_INVALID_JSON_BODY',
            'FST_ERR_CTP_EMPTY_JSON_BODY',
            'FST_ERR_CTP_INVALID_MEDIA_TYPE',
            'FST_ERR_CTP_BODY_TOO_LARGE',
          ].includes(error.code)));
    if (validationError) {
      return reply
        .code(400)
        .send(
          createApiError(
            'VALIDATION_ERROR',
            'Revisa los datos enviados.',
            request.id,
          ),
        );
    }
    request.log.error(
      { requestId: request.id, code: 'INTERNAL_ERROR' },
      'Request failed.',
    );
    return reply
      .code(500)
      .send(
        createApiError(
          'INTERNAL_ERROR',
          'No pudimos completar la solicitud.',
          request.id,
        ),
      );
  });
  registerLiveRoute(app);
  return app;
}
