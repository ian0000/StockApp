import type { FromSchema } from 'json-schema-to-ts';

export const requestIdSchema = { type: 'string', minLength: 1 } as const;
export const liveResponseSchema = {
  type: 'object',
  properties: { status: { type: 'string', const: 'ok' } },
  required: ['status'],
  additionalProperties: false,
} as const;

export const apiErrorSchema = {
  type: 'object',
  properties: {
    error: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          enum: [
            'NOT_FOUND',
            'VALIDATION_ERROR',
            'INTERNAL_ERROR',
            'UNAUTHENTICATED',
            'EMAIL_NOT_VERIFIED',
            'CLOUD_ACCESS_DISABLED',
            'BUSINESS_ALREADY_EXISTS',
          ],
        },
        message: { type: 'string', minLength: 1 },
        requestId: requestIdSchema,
        fieldErrors: {
          type: 'object',
          additionalProperties: { type: 'array', items: { type: 'string' } },
        },
      },
      required: ['code', 'message', 'requestId'],
      additionalProperties: false,
    },
  },
  required: ['error'],
  additionalProperties: false,
} as const;

export type RequestId = FromSchema<typeof requestIdSchema>;
export type LiveResponse = FromSchema<typeof liveResponseSchema>;
export type ApiErrorEnvelope = FromSchema<typeof apiErrorSchema>;
export type ApiErrorCode = ApiErrorEnvelope['error']['code'];

export function createApiError(
  code: ApiErrorCode,
  message: string,
  requestId: RequestId,
): ApiErrorEnvelope {
  return { error: { code, message, requestId } };
}
