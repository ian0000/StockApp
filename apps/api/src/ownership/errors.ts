import type { ApiErrorCode } from '@stock-app/contracts';

export class OwnershipError extends Error {
  constructor(
    readonly statusCode: 400 | 401 | 403 | 404 | 409,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
  }
}
