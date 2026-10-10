export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_JSON'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'FORBIDDEN'
  | 'INVALID_ORIGIN'
  | 'NOT_FOUND'
  | 'EMAIL_ALREADY_REGISTERED'
  | 'PAYLOAD_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'DATABASE_UNAVAILABLE'
  | 'BRE_FAILED'
  | 'PROFILE_INCOMPLETE'
  | 'ACTIVE_LOAN_EXISTS'
  | 'INVALID_STATUS_TRANSITION'
  | 'FILE_REQUIRED'
  | 'INVALID_UPLOAD'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FILE_TYPE'
  | 'LOAN_NOT_DISBURSED'
  | 'DUPLICATE_UTR'
  | 'PAYMENT_RULES_FAILED'
  | 'CANNOT_CHANGE_OWN_ROLE'
  | 'LAST_ADMIN'
  | 'BORROWER_HAS_LOANS'
  | 'ROLE_CHANGED'
  | 'BAD_REQUEST'
  | 'UNSUPPORTED_MEDIA_TYPE';

/**
 * An expected, client-facing error. Services throw it; the central error handler turns it
 * into `{ success: false, error: { code, message, details? } }` with `statusCode`.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(statusCode: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}
