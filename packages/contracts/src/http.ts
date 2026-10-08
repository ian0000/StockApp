import type { FromSchema } from 'json-schema-to-ts';
import { revisionSchema } from './transport.js';

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
            'SESSION_NOT_FRESH',
            'CLOUD_ACCESS_DISABLED',
            'BUSINESS_ALREADY_EXISTS',
            'ORIGIN_NOT_ALLOWED',
            'CSRF_TOKEN_INVALID',
            'PAYLOAD_TOO_LARGE',
            'UNSUPPORTED_MEDIA_TYPE',
            'RATE_LIMITED',
            'UNSUPPORTED_PROTOCOL',
            'REVISION_CONFLICT',
            'COST_SNAPSHOT_CONFLICT',
            'IDEMPOTENCY_KEY_REUSED',
            'IMPORT_NOT_EMPTY',
            'SYNC_RESET_REQUIRED',
            'SNAPSHOT_EXPIRED',
            'DOMAIN_RULE',
            'VOID_NOT_ELIGIBLE',
            'MONEY_OVERFLOW',
            'TEMPORARILY_UNAVAILABLE',
          ],
        },
        message: { type: 'string', minLength: 1 },
        requestId: requestIdSchema,
        fieldErrors: {
          type: 'object',
          additionalProperties: { type: 'array', items: { type: 'string' } },
        },
        details: {
          type: 'object',
          properties: {
            currentRevision: revisionSchema,
          },
          required: ['currentRevision'],
          additionalProperties: false,
        },
      },
      required: ['code', 'message', 'requestId'],
      additionalProperties: false,
      allOf: [
        {
          if: { properties: { details: true }, required: ['details'] },
          then: { properties: { code: { const: 'REVISION_CONFLICT' } } },
        },
      ],
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
