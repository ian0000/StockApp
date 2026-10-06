import type { ApiErrorCode } from '@stock-app/contracts';

export class CommandError extends Error {
  constructor(
    readonly statusCode: 400 | 409,
    readonly code: Extract<
      ApiErrorCode,
      'VALIDATION_ERROR' | 'IDEMPOTENCY_KEY_REUSED'
    >,
  ) {
    super(
      code === 'IDEMPOTENCY_KEY_REUSED'
        ? 'Esta operación ya fue enviada con otros datos.'
        : 'Revisa los datos enviados.',
    );
  }
}
